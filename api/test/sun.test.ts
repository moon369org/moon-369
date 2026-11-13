import { describe, it, expect } from 'vitest';
import { handle } from '../src/index';
import { seasonEvent, sunDay, toSun, fromSun, seasonAt, SunError } from '../src/sun';

const get = (path: string) => handle(new Request(`https://api.example.org${path}`), {});
const j = async (r: Promise<Response>): Promise<any> => (await r).json();
const iso = (ns: bigint) => new Date(Number(ns / 1_000_000n)).toISOString();
const near = (ns: bigint, isoStr: string, minutes: number) =>
  expect(Math.abs(Number(ns / 1_000_000n) - Date.parse(isoStr)) / 60000).toBeLessThan(minutes);

describe('sun astronomy', () => {
  it('matches published equinoxes and solstices', () => {
    near(seasonEvent(2025, 0), '2025-03-20T09:01Z', 2);
    near(seasonEvent(2025, 1), '2025-06-21T02:42Z', 2);
    near(seasonEvent(2025, 2), '2025-09-22T18:19Z', 2);
    near(seasonEvent(2025, 3), '2025-12-21T15:03Z', 2);
    near(seasonEvent(2026, 3), '2026-12-21T20:50Z', 2);
  });
  it('gives sunrise and sunset for the requested date', () => {
    const d = sunDay('2026-06-21', 51.4779, 0); // Greenwich
    near(d.sunrise!, '2026-06-21T03:43Z', 4);
    near(d.sunset!, '2026-06-21T20:21Z', 4);
  });
  it('handles polar night and midnight sun', () => {
    expect(sunDay('2026-12-21', 78.2, 15.6).polar).toBe('night');
    expect(sunDay('2026-06-21', 78.2, 15.6).polar).toBe('day');
  });
  it('names seasons per hemisphere', () => {
    const ns = BigInt(Date.parse('2026-11-12T12:00Z')) * 1_000_000n;
    expect(seasonAt(ns, 'north').name).toBe('Autumn');
    expect(seasonAt(ns, 'south').name).toBe('Spring');
    expect(seasonAt(ns).next.event).toBe('December solstice');
  });
});

describe('sun local clock', () => {
  it('reads an instant in a zone, with DST', () => {
    const s = toSun(BigInt(Date.parse('2026-07-01T20:00Z')) * 1_000_000n, 'America/Denver');
    expect([s.date, s.time, s.utc_offset, s.dst]).toEqual(['2026-07-01', '14:00:00', '-06:00', true]);
  });
  it('maps 14:00 local to the right instant year round', () => {
    expect(iso(fromSun('2026-01-15', '14:00', 'America/Denver'))).toBe('2026-01-15T21:00:00.000Z');
    expect(iso(fromSun('2026-07-15', '14:00', 'America/Denver'))).toBe('2026-07-15T20:00:00.000Z');
  });
  it('rejects times clocks skip and unknown zones', () => {
    expect(() => fromSun('2026-03-08', '02:30', 'America/Denver')).toThrow(SunError);
    expect(() => toSun(0n, 'Mars/Olympus')).toThrow(SunError);
  });
});

describe('sun routes', () => {
  it('GET /v1/now with tz and lat/lon adds sun', async () => {
    const b = await j(get('/v1/now?tz=America/Denver&lat=39.74&lon=-104.99'));
    expect(b.time_zone).toBeNull();
    expect(b.sun.zone).toBe('America/Denver');
    expect(b.sun.day.sunrise.moonmark).toMatch(/^\d+\.\d{2}\.\d{2} /);
    expect(['Spring', 'Summer', 'Autumn', 'Winter']).toContain(b.sun.season.name);
  });
  it('GET /v1/convert accepts a local Sun time', async () => {
    const b = await j(get('/v1/convert?sun=2026-11-12T14:00&tz=America/Denver'));
    expect(b.utc.startsWith('2026-11-12T21:00:00')).toBe(true);
    expect(b.sun.time).toBe('14:00:00');
  });
  it('GET /v1/schedule gives each 14:00 local with its Moonmark', async () => {
    const b = await j(get('/v1/schedule?time=14:00&tz=America/Denver&from=2026-11-01&days=3'));
    expect(b.occurrences).toHaveLength(3);
    expect(b.occurrences.every((o: any) => o.local === '14:00:00')).toBe(true);
    expect(new Set(b.occurrences.map((o: any) => o.moonmark.slice(-18, -10))).size).toBe(3); // Moon clock time differs day to day
  });
  it('GET /v1/sun for a date and /v1/seasons/{year}', async () => {
    const s = await j(get('/v1/sun?lat=39.74&lon=-104.99&tz=America/Denver&date=2026-12-21'));
    expect(s.sun.day.date).toBe('2026-12-21');
    const y = await j(get('/v1/seasons/1928'));
    expect(y.events.length).toBeGreaterThanOrEqual(4);
  });
  it('errors cleanly', async () => {
    expect((await get('/v1/now?tz=Nope/Zone')).status).toBe(400);
    expect((await get('/v1/now?lat=40')).status).toBe(400);
    expect((await get('/v1/convert?sun=2026-11-12T14:00')).status).toBe(400);
  });
});

import { localMoonDate } from '../src/sun';
describe('local Moon date (local-noon rule)', () => {
  it('gives one Moon date per local day', () => {
    expect(localMoonDate('2026-11-12', 'America/Denver').label).toBe('1928.05.03');
  });
  it('marks the days where two local days share a Moon date', () => {
    const labels: string[] = []; let shared = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
      const m = localMoonDate(d, 'America/Denver');
      labels.push(m.label); if (m.shared_with) shared++;
    }
    expect(new Set(labels).size).toBeGreaterThanOrEqual(57); // 60 local days, 2 or 3 pairs
    expect(shared % 2).toBe(0);
    expect(shared).toBeGreaterThan(0);
  });
  it('is not used by the API: /v1/sun has no local date and schedule uses the global Moon date', async () => {
    const s = await j(get('/v1/sun?tz=America/Denver&date=2026-11-12'));
    expect(s.sun.moon_date).toBeUndefined();
    const sc = await j(get('/v1/schedule?time=09:00&tz=America/Denver&from=2026-11-12&days=1'));
    expect(sc.occurrences[0].moon_date).toBe(sc.occurrences[0].moonmark.split(' ')[0]);
  });
});
