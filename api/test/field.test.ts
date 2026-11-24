import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { Signer } from '../src/receipt';
import { handle, type Env } from '../src/index';
import { canonical, recordSha256, nwsWeather, type Weather } from '../src/field';

const W: Weather = { source: 'US National Weather Service', station: 'KDIJ', station_name: 'Driggs-Reed Memorial Airport', distance_km: 4.2, observed_utc: '2026-11-23T17:53:00Z',
  temp_c: 2.8, humidity_pct: 61, wind_kmh: 9.4, wind_gust_kmh: null, wind_from_deg: 230, conditions: 'Partly Cloudy' };
const env: Env = { SIGNER: new Signer(generateKeyPairSync('ed25519').privateKey), BEACON: async () => null, WEATHER: async () => W };
const post = async (path: string, body: unknown, e: Env = env) =>
  handle(new Request('https://api.example.org' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e);
const PHOTO = 'ab'.repeat(32);
const ENTRY = { entry: { kind: 'spray', field: 'North 40', crop: 'Barley', product: 'Roundup PowerMAX 3', epa_reg: '524-659', rate: '22 oz/acre', notes: 'Light breeze' }, photos: [PHOTO], lat: 43.7231, lng: -111.1113, accuracy_m: 6 };

describe('field log', () => {
  it('signs a record with weather, and the fingerprint matches the receipt', async () => {
    const r = await post('/v1/field/sign', ENTRY);
    expect(r.status).toBe(200);
    const j = await r.json() as any;
    expect(j.record.format).toBe('moon-field/1');
    expect(j.record.weather.station).toBe('KDIJ');
    expect(j.record.place).toEqual({ lat: 43.7231, lng: -111.1113, accuracy_m: 6 });
    expect(j.receipt.sha256).toBe(recordSha256(j.record));
    expect(j.record_sha256).toBe(j.receipt.sha256);
    const v = await (await post('/v1/field/verify', { record: j.record, receipt: j.receipt })).json() as any;
    expect(v.valid).toBe(true); expect(v.record_matches).toBe(true);
  });
  it('catches any change to the record, weather included', async () => {
    const j = await (await post('/v1/field/sign', ENTRY)).json() as any;
    for (const edit of [(x: any) => { x.weather.wind_kmh = 3; }, (x: any) => { x.entry.rate = '12 oz/acre'; }, (x: any) => { x.photos = []; }]) {
      const rec = JSON.parse(JSON.stringify(j.record)); edit(rec);
      const v = await (await post('/v1/field/verify', { record: rec, receipt: j.receipt })).json() as any;
      expect(v.valid).toBe(false); expect(v.record_matches).toBe(false);
    }
  });
  it('works without a place or weather, and checks its input', async () => {
    const j = await (await post('/v1/field/sign', { entry: { kind: 'damage', notes: 'Hail' } }, { ...env, WEATHER: undefined })).json() as any;
    expect(j.record.place).toBeNull(); expect(j.record.weather).toBeNull();
    expect((await post('/v1/field/sign', { entry: { kind: 'dance' } })).status).toBe(400);
    expect((await post('/v1/field/sign', { entry: { kind: 'spray' } })).status).toBe(400);
    expect((await post('/v1/field/sign', { entry: { kind: 'spray', field: 'A' }, photos: ['not-a-hash'] })).status).toBe(400);
    expect((await post('/v1/field/sign', { entry: { kind: 'spray', field: 'A' }, lat: 43 })).status).toBe(400);
  });
  it('keeps the phone time of an entry signed later, without weather from the wrong moment', async () => {
    const old = new Date(Date.now() - 3 * 3600000).toISOString();
    const j = await (await post('/v1/field/sign', { ...ENTRY, entry: { ...ENTRY.entry, written_utc: old } })).json() as any;
    expect(j.record.entry.written_utc).toBe(old.replace(/\.\d+Z$/, 'Z'));
    expect(j.record.weather).toBeNull();
    const fresh = await (await post('/v1/field/sign', { ...ENTRY, entry: { ...ENTRY.entry, written_utc: new Date().toISOString() } })).json() as any;
    expect(fresh.record.weather.station).toBe('KDIJ');
    const future = await (await post('/v1/field/sign', { ...ENTRY, entry: { ...ENTRY.entry, written_utc: '2099-01-01T00:00:00Z' } })).json() as any;
    expect(future.record.entry.written_utc).toBeNull();
  });
  it('canonical JSON sorts keys at every level', () => {
    expect(canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });
  it('reads the nearest NWS observation', async () => {
    const f = (async (url: string) => {
      const body = url.includes('/points/') ? { properties: { observationStations: 'https://api.weather.gov/gridpoints/PIH/1,2/stations' } }
        : url.endsWith('/stations') ? { features: [{ geometry: { coordinates: [-111.1, 43.74] }, properties: { stationIdentifier: 'KDIJ', name: 'Driggs' } }] }
        : { properties: { timestamp: '2026-11-23T17:53:00+00:00', temperature: { value: 2.8 }, relativeHumidity: { value: 61.23 }, windSpeed: { value: 9.36 }, windGust: { value: null }, windDirection: { value: 230 }, textDescription: 'Partly Cloudy' } };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const w = await nwsWeather(f)(43.7231, -111.1113);
    expect(w).toMatchObject({ station: 'KDIJ', temp_c: 2.8, humidity_pct: 61.2, wind_kmh: 9.4, wind_from_deg: 230, observed_utc: '2026-11-23T17:53:00Z' });
    expect(w!.distance_km).toBeGreaterThan(0);
    const down = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    expect(await nwsWeather(down)(43.7, -111.1)).toBeNull();
  });
});
