import { describe, it, expect } from 'vitest';
import { handle } from '../src/index';
import { lightAt, lightSeries, counter } from '../src/light';

const get = (path: string) => handle(new Request(`https://api.example.org${path}`), {});
const j = async (r: Promise<Response>): Promise<any> => (await r).json();
const DENVER = { lat: 39.74, lon: -104.99 };
const at = (iso: string) => Date.parse(iso);

describe('Light and Dark counters', () => {
  it('counts Light from first light in Moon seconds', () => {
    const r = lightAt(at('2026-11-13T21:00:00Z'), DENVER.lat, DENVER.lon); // 14:00 MST
    expect(r.phase).toBe('light');
    expect(r.label).toBe('Light 07:00:42');
    expect(new Date(r.day_start_ms).toISOString().slice(0, 16)).toBe('2026-11-13T13:42'); // 06:42 MST
  });
  it('switches to Dark at sunset and keeps the day until the next first light', () => {
    const r = lightAt(at('2026-11-14T01:30:00Z'), DENVER.lat, DENVER.lon); // 18:30 MST
    expect(r.phase).toBe('dark');
    expect(r.counter.startsWith('01:39')).toBe(true);
  });
  it('falls back to solar midnight in polar night', () => {
    const r = lightAt(at('2026-12-10T12:00:00Z'), 69.65, 18.96); // Tromsø
    expect(r.polar).toBe('night');
    expect(r.phase).toBe('dark');
  });
  it('repeats a Light reading every day, at the same point in the light', () => {
    const s = lightSeries(at('2026-11-13T20:00:00Z'), 'light', '06:45', DENVER.lat, DENVER.lon, 3);
    expect(s).toHaveLength(3);
    s.forEach((o) => expect(lightAt(o.ms!, DENVER.lat, DENVER.lon).counter.startsWith('06:45')).toBe(true));
  });
  it('skips days that do not have that much light', () => {
    const s = lightSeries(at('2026-12-01T12:00:00Z'), 'light', '12:00', DENVER.lat, DENVER.lon, 2);
    expect(s.every((o) => o.ms === null)).toBe(true);
  });
  it('formats counters in Moon seconds', () => {
    expect(counter(1040.3730490216803 * 3600)).toBe('01:00:00');
  });
});

describe('Light routes', () => {
  it('GET /v1/light needs only a location', async () => {
    const b = await j(get('/v1/light?lat=39.74&lon=-104.99&utc=2026-11-13T21:00:00Z'));
    expect(b.light.label).toBe('Light 07:00:42');
    expect(b.light.first_light.moonmark).toMatch(/^1928\.05\.04 /);
    expect(b.light.day).toBeUndefined();
    expect(b.light.ends.moonmark).toMatch(/^1928\.05\.04 /);
  });
  it('GET /v1/now with lat and lon adds light, with no time zone', async () => {
    const b = await j(get('/v1/now?lat=39.74&lon=-104.99'));
    expect(['light', 'dark']).toContain(b.light.phase);
    expect(b.sun).toBeUndefined();
  });
  it('GET /v1/schedule repeats a Light counter', async () => {
    const b = await j(get('/v1/schedule?light=06:45&lat=39.74&lon=-104.99&utc=2026-11-13T20:00:00Z&days=3'));
    expect(b.occurrences).toHaveLength(3);
    expect(b.occurrences[0].label).toBe('Light 06:45');
    for (const o of b.occurrences) expect(o.moon_date).toBe(o.moonmark.split(' ')[0]);
  });
  it('the Moon date is global: the same instant has one date everywhere', async () => {
    const t = '2026-11-14T03:00:00Z';
    const a = await j(get(`/v1/light?lat=39.74&lon=-104.99&utc=${t}`));
    const b = await j(get(`/v1/light?lat=35.68&lon=139.69&utc=${t}`));
    expect(a.moonmark.split(' ')[0]).toBe(b.moonmark.split(' ')[0]);
  });
  it('errors cleanly', async () => {
    expect((await get('/v1/light?lat=43')).status).toBe(400);
    expect((await get('/v1/schedule?light=6x&lat=1&lon=1')).status).toBe(400);
  });
});
