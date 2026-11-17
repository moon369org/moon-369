import { describe, it, expect, beforeEach } from 'vitest';
import { tidesNear, nearest, distanceKm, resetTides } from '../src/tides';

const stations = { stations: [{ id: '9414290', name: 'San Francisco', state: 'CA', lat: 37.8063, lng: -122.4659 }, { id: '8518750', name: 'The Battery', state: 'NY', lat: 40.7006, lng: -74.0142 }] };
const f = (async (u: string) => {
  if (u.includes('stations.json')) return new Response(JSON.stringify(stations));
  if (u.includes('interval=hilo')) return new Response(JSON.stringify({ predictions: [{ t: '2026-11-17 03:12', v: '5.812', type: 'H' }, { t: '2026-11-17 09:40', v: '-0.31', type: 'L' }] }));
  return new Response(JSON.stringify({ predictions: [{ t: '2026-11-17 03:00', v: '5.7' }, { t: '2026-11-17 03:30', v: '5.8' }] }));
}) as typeof fetch;

describe('tides', () => {
  beforeEach(() => resetTides());
  it('finds the nearest station', () => {
    expect(nearest(stations.stations, { lat: 37.77, lng: -122.42 })!.station.id).toBe('9414290');
    expect(Math.round(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }))).toBe(111);
  });
  it('returns highs, lows and a curve in UTC', async () => {
    const t = await tidesNear(40.7, -74.0, Date.UTC(2026, 10, 17), f);
    expect(t.station).toMatchObject({ id: '8518750', name: 'The Battery', distance_km: 1 });
    expect(t.hilo).toEqual([{ utc: '2026-11-17T03:12:00Z', ft: 5.81, type: 'high' }, { utc: '2026-11-17T09:40:00Z', ft: -0.31, type: 'low' }]);
    // drawn between the turns: starts at the high, ends near the low
    expect(t.curve[0].utc).toBe('2026-11-17T03:30:00Z');
    expect(t.curve[0].ft).toBeLessThan(5.81); expect(t.curve[t.curve.length - 1].ft).toBeGreaterThan(-0.31);
  });
});
