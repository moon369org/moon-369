/**
 * Tides for a place, from NOAA's tide predictions (US coasts, public domain): the nearest prediction
 * station, its highs and lows, and a half-hourly curve, all in UTC. The phone works out the rest.
 */
const NOAA = 'https://api.tidesandcurrents.noaa.gov';

export interface Station { id: string; name: string; state: string; lat: number; lng: number }
let stations: Station[] | null = null, stationsAt = 0;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function stationList(f: typeof fetch): Promise<Station[]> {
  if (stations && Date.now() - stationsAt < 7 * 864e5) return stations;
  const r = await f(`${NOAA}/mdapi/prod/webapi/stations.json?type=tidepredictions`, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Moon (+https://moon369.org)', Accept: 'application/json' } });
  if (!r.ok) throw new Error('stations ' + r.status);
  const j = (await r.json()) as { stations?: { id: string; name: string; state?: string; lat: number | string; lng: number | string }[] };
  stations = (j.stations ?? []).map((s) => ({ id: String(s.id), name: String(s.name), state: String(s.state ?? ''), lat: Number(s.lat), lng: Number(s.lng) }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  stationsAt = Date.now();
  return stations;
}

export function nearest(list: Station[], at: { lat: number; lng: number }): { station: Station; km: number } | null {
  let best: Station | null = null, km = Infinity;
  for (const s of list) { const d = distanceKm(at, s); if (d < km) { km = d; best = s; } }
  return best ? { station: best, km } : null;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
const iso = (t: string) => t.replace(' ', 'T') + ':00Z';   // NOAA gives "2026-11-17 03:12" in GMT

async function predictions(f: typeof fetch, id: string, begin: number, interval: string) {
  const q = new URLSearchParams({ product: 'predictions', application: 'moon369', begin_date: ymd(begin), range: '72', datum: 'MLLW', station: id, time_zone: 'gmt', units: 'english', interval, format: 'json' });
  const r = await f(`${NOAA}/api/prod/datagetter?${q}`, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Moon (+https://moon369.org)', Accept: 'application/json' } });
  if (!r.ok) throw new Error('predictions ' + r.status);
  const j = (await r.json()) as { predictions?: { t: string; v: string; type?: string }[]; error?: { message: string } };
  if (!j.predictions) throw new Error(j.error?.message ?? 'no predictions');
  return j.predictions;
}

export async function tidesNear(lat: number, lng: number, nowMs: number, f: typeof fetch = fetch) {
  const n = nearest(await stationList(f), { lat, lng });
  if (!n) throw new Error('no stations');
  const begin = nowMs - 864e5;
  // Most stations near a coastline are subordinate stations, which NOAA only predicts as highs and lows,
  // so the curve is drawn between them the standard way: a half cosine from each turn to the next.
  const hl = await predictions(f, n.station.id, begin, 'hilo');
  const turns = hl.map((p) => ({ t: Date.parse(iso(p.t)), v: Number(p.v) })).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.v));
  const curve: { t: string; v: string }[] = [];
  for (let i = 0; i + 1 < turns.length; i++) {
    const a = turns[i], b = turns[i + 1];
    for (let t = Math.ceil(a.t / 1_800_000) * 1_800_000; t < b.t; t += 1_800_000) {
      const k = (1 - Math.cos(Math.PI * (t - a.t) / (b.t - a.t))) / 2;
      curve.push({ t: new Date(t).toISOString().slice(0, 16).replace('T', ' '), v: String(a.v + (b.v - a.v) * k) });
    }
  }
  return {
    station: { ...n.station, distance_km: Math.round(n.km) },
    units: 'ft', datum: 'MLLW (mean lower low water)',
    hilo: hl.map((p) => ({ utc: iso(p.t), ft: Math.round(Number(p.v) * 100) / 100, type: p.type === 'H' ? 'high' : 'low' })),
    curve: curve.map((p) => ({ utc: iso(p.t), ft: Math.round(Number(p.v) * 100) / 100 })),
    source: 'NOAA CO-OPS tide predictions',
  };
}

/** For tests: forget the cached station list. */
export function resetTides() { stations = null; stationsAt = 0; }
