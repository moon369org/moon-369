// Field Log: a signed record of work done on a farm or site (a spray, a planting, storm damage).
// The record holds what the person entered, the fingerprints of their photos, where they stood, and the
// weather Moon looked up at that moment. Moon signs the SHA-256 of the record, so changing any part of it,
// including the weather, breaks the match. Moon keeps none of it: only the fingerprint goes on the Tideline.
import { createHash } from 'node:crypto';

export const FIELD_FORMAT = 'moon-field/1';
export const FIELD_KINDS = ['spray', 'planting', 'fertilizer', 'irrigation', 'harvest', 'damage', 'livestock', 'inspection', 'other'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface Weather {
  source: string;            // who measured it
  station: string | null;    // station id, e.g. KDIJ
  station_name: string | null;
  distance_km: number | null;
  observed_utc: string | null;
  temp_c: number | null;
  humidity_pct: number | null;
  wind_kmh: number | null;
  wind_gust_kmh: number | null;
  wind_from_deg: number | null;
  conditions: string | null;
}
/** Looks up the latest observed weather near a point. Returns null when there is none. */
export type WeatherSource = (lat: number, lng: number) => Promise<Weather | null>;

/** Canonical JSON: keys sorted at every level, undefined dropped. The record's fingerprint is SHA-256 of this. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}
export const recordSha256 = (record: unknown) => createHash('sha256').update(canonical(record), 'utf8').digest('hex');

const txt = (v: unknown, max: number) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  return s ? s.slice(0, max) : null;
};
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

export class FieldError extends Error {}
function writtenUtc(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)) return null;
  const ms = Date.parse(v); if (!Number.isFinite(ms) || ms > Date.now() + 5 * 60000) return null;
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
}
/** Weather is looked up only for entries signed within 15 minutes of being written: later, it would describe the wrong moment. */
export const weatherFits = (written: string | null, now = Date.now()) => !written || now - Date.parse(written) <= 15 * 60000;

/** Builds the record from a request body, checking every field. Weather is added by the caller. */
export function fieldRecord(body: Record<string, unknown>) {
  const e = (body.entry && typeof body.entry === 'object' ? body.entry : {}) as Record<string, unknown>;
  const kind = txt(e.kind, 20);
  if (!kind || !(FIELD_KINDS as readonly string[]).includes(kind)) throw new FieldError('entry.kind must be one of ' + FIELD_KINDS.join(', '));
  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length > 8) throw new FieldError('At most 8 photos per entry');
  const shas = photos.map((p) => (typeof p === 'string' ? p.toLowerCase() : ''));
  if (!shas.every((p) => /^[0-9a-f]{64}$/.test(p))) throw new FieldError('photos must be SHA-256 fingerprints (64 hex characters). Send fingerprints, never the photos.');
  const lat = num(body.lat, -90, 90), lng = num(body.lng, -180, 180);
  if ((lat === null) !== (lng === null)) throw new FieldError('Send both lat and lng, or neither');
  const entry = {
    kind,
    field: txt(e.field, 80),
    crop: txt(e.crop, 80),
    product: txt(e.product, 120),
    epa_reg: txt(e.epa_reg, 40),
    rate: txt(e.rate, 60),
    area: txt(e.area, 60),
    notes: txt(e.notes, 2000),
    by: txt(e.by, 80),
    // When the phone saved it. Entries made with no signal are signed later; this keeps the moment they were written.
    written_utc: writtenUtc(e.written_utc),
  };
  if (!entry.field && !entry.notes && !shas.length) throw new FieldError('Add a field name, a note or a photo');
  return {
    format: FIELD_FORMAT,
    entry,
    photos: shas,
    place: lat === null ? null : { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round((lng as number) * 1e5) / 1e5, accuracy_m: num(body.accuracy_m, 0, 100000) === null ? null : Math.round(body.accuracy_m as number) },
    weather: null as Weather | null,
  };
}

const R = 6371;
function km(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const val = (q: unknown) => { const v = q && typeof q === 'object' ? (q as { value?: unknown }).value : null; return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null; };

/** US National Weather Service: the latest observation from the nearest station. Public domain, no key. US only. */
export function nwsWeather(fetcher: typeof fetch = fetch, timeoutMs = 3500): WeatherSource {
  const get = async (url: string) => {
    const r = await fetcher(url, { headers: { 'User-Agent': 'Moon (moon369.org, moon369org@proton.me)', Accept: 'application/geo+json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error('nws ' + r.status);
    return r.json() as Promise<Record<string, any>>;
  };
  return async (lat, lng) => {
    try {
      const pt = await get(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`);
      const stUrl = pt?.properties?.observationStations; if (typeof stUrl !== 'string') return null;
      const st = await get(stUrl);
      const feats = Array.isArray(st?.features) ? st.features.slice(0, 3) : [];
      for (const f of feats) {
        const id = f?.properties?.stationIdentifier; if (typeof id !== 'string') continue;
        const ob = await get(`https://api.weather.gov/stations/${id}/observations/latest`).catch(() => null);
        const p = ob?.properties; if (!p) continue;
        const temp = val(p.temperature); if (temp === null && val(p.windSpeed) === null) continue;
        const c = f?.geometry?.coordinates;
        return {
          source: 'US National Weather Service', station: id, station_name: typeof f.properties.name === 'string' ? f.properties.name : null,
          distance_km: Array.isArray(c) ? Math.round(km([lat, lng], [c[1], c[0]]) * 10) / 10 : null,
          observed_utc: typeof p.timestamp === 'string' ? new Date(p.timestamp).toISOString().replace('.000Z', 'Z') : null,
          temp_c: temp, humidity_pct: val(p.relativeHumidity), wind_kmh: val(p.windSpeed), wind_gust_kmh: val(p.windGust),
          wind_from_deg: val(p.windDirection), conditions: typeof p.textDescription === 'string' && p.textDescription ? p.textDescription : null,
        };
      }
      return null;
    } catch { return null; }
  };
}
