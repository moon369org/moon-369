import { toMoon } from './moon.js';
/**
 * Sun: the local layer of Moon.
 * Moon is one global reading of an instant. Sun is the same instant read on a
 * place's local civil clock (IANA time zone, standard seconds), so people can
 * schedule locally. Time zones live only here; Moon itself has none.
 */

export class SunError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface SunTime {
  zone: string;
  date: string;      // YYYY-MM-DD local
  time: string;      // HH:MM:SS local
  weekday: string;   // Mon..Sun
  utc_offset: string; // +HH:MM
  dst: boolean;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(zone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23', weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch {
      throw new SunError('bad_tz', `tz must be an IANA time zone such as America/Denver (got "${zone}")`);
    }
    fmtCache.set(zone, f);
  }
  return f;
}

/** Validates and returns the canonical zone name. */
export function checkZone(zone: string): string {
  return fmt(zone).resolvedOptions().timeZone;
}

interface Parts { y: number; mo: number; d: number; h: number; mi: number; s: number; wd: string }
function parts(ms: number, zone: string): Parts {
  const o: Record<string, string> = {};
  for (const p of fmt(zone).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
}

/** Offset of local time from UTC, in minutes, at an instant. */
function offsetMin(ms: number, zone: string): number {
  const p = parts(ms, zone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');
const fmtOffset = (m: number) => (m < 0 ? '-' : '+') + pad(Math.floor(Math.abs(m) / 60)) + ':' + pad(Math.abs(m) % 60);

/** Read an instant on a place's local clock. */
export function toSun(unixNs: bigint, zone: string): SunTime {
  const z = checkZone(zone);
  const ms = Number(unixNs / 1_000_000n) - (unixNs < 0n && unixNs % 1_000_000n !== 0n ? 1 : 0);
  const p = parts(ms, z);
  const off = offsetMin(ms, z);
  const y = p.y;
  const std = Math.min(offsetMin(Date.UTC(y, 0, 1), z), offsetMin(Date.UTC(y, 6, 1), z));
  return {
    zone: z,
    date: `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}`,
    time: `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`,
    weekday: p.wd,
    utc_offset: fmtOffset(off),
    dst: off > std,
  };
}

/**
 * A local date and time in a zone to the exact instant.
 * Ambiguous times (clocks falling back) resolve to the earlier instant.
 * Times skipped by clocks springing forward are rejected.
 */
export function fromSun(date: string, time: string, zone: string): bigint {
  const z = checkZone(zone);
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dm) throw new SunError('bad_param', 'Sun date must be YYYY-MM-DD');
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/.exec(time);
  if (!tm) throw new SunError('bad_param', 'Sun time must be HH:MM, HH:MM:SS or HH:MM:SS.fraction');
  const [y, mo, d, h, mi, s] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2], tm[3] ? +tm[3] : 0];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) throw new SunError('bad_param', 'Sun date or time is out of range');
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(naive);
  if (check.getUTCDate() !== d) throw new SunError('bad_param', `${date} is not a real date`);
  const frac = tm[4] ? BigInt(tm[4].padEnd(9, '0')) : 0n;
  // Try each offset in effect around that local time; keep those that read back exactly.
  const cands = new Set([offsetMin(naive - 86400000, z), offsetMin(naive, z), offsetMin(naive + 86400000, z)]);
  const hits: number[] = [];
  for (const off of cands) {
    const ms = naive - off * 60000;
    const p = parts(ms, z);
    if (p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi && p.s === s) hits.push(ms);
  }
  if (!hits.length) throw new SunError('nonexistent_time', `${date} ${time} does not exist in ${z} (clocks skip it)`);
  return BigInt(Math.min(...hits)) * 1_000_000n + frac;
}

/** The next `days` occurrences of a daily local time, starting on `from` (YYYY-MM-DD). */
export function dailySeries(from: string, time: string, zone: string, days: number): { sunDate: string; unixNs: bigint | null }[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  if (!m) throw new SunError('bad_param', 'from must be YYYY-MM-DD');
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const out: { sunDate: string; unixNs: bigint | null }[] = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(base + i * 86400000);
    const sd = `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    try { out.push({ sunDate: sd, unixNs: fromSun(sd, time, zone) }); }
    catch (e) { if (e instanceof SunError && e.code === 'nonexistent_time') out.push({ sunDate: sd, unixNs: null }); else throw e; }
  }
  return out;
}

/* ───────────── Sun astronomy: the day and the seasons ───────────── */

const D2R = Math.PI / 180;
const JD_UNIX0 = 2440587.5;
const jdToMs = (jd: number) => (jd - JD_UNIX0) * 86400000;
const msToJd = (ms: number) => ms / 86400000 + JD_UNIX0;
const msToNs = (ms: number) => BigInt(Math.round(ms)) * 1_000_000n;

export function checkLatLon(lat: number, lon: number) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new SunError('bad_param', 'lat must be between -90 and 90');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new SunError('bad_param', 'lon must be between -180 and 180');
}

export interface SunDay {
  sunrise: bigint | null;    // unix ns, null during polar night or midnight sun
  solar_noon: bigint;
  sunset: bigint | null;
  day_length_s: number;      // standard seconds of daylight
  polar: 'day' | 'night' | null;
}

/**
 * Sunrise, solar noon and sunset for a calendar date (YYYY-MM-DD) at a place.
 * Sunrise equation with refraction and the solar disc (−0.833°). Good to about a minute.
 */
export function sunDay(date: string, lat: number, lon: number): SunDay {
  checkLatLon(lat, lon);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new SunError('bad_param', 'date must be YYYY-MM-DD');
  const jdNoon = msToJd(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  const n = Math.round(jdNoon - 2451545.0);
  const Js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const C = 1.9148 * Math.sin(M * D2R) + 0.02 * Math.sin(2 * M * D2R) + 0.0003 * Math.sin(3 * M * D2R);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545 + Js + 0.0053 * Math.sin(M * D2R) - 0.0069 * Math.sin(2 * L * D2R);
  const sd = Math.sin(L * D2R) * Math.sin(23.4397 * D2R);
  const cd = Math.cos(Math.asin(sd));
  const cw = (Math.sin(-0.833 * D2R) - Math.sin(lat * D2R) * sd) / (Math.cos(lat * D2R) * cd);
  const noon = msToNs(jdToMs(Jt));
  if (cw > 1) return { sunrise: null, solar_noon: noon, sunset: null, day_length_s: 0, polar: 'night' };
  if (cw < -1) return { sunrise: null, solar_noon: noon, sunset: null, day_length_s: 86400, polar: 'day' };
  const w = Math.acos(cw) / D2R;
  return {
    sunrise: msToNs(jdToMs(Jt - w / 360)),
    solar_noon: noon,
    sunset: msToNs(jdToMs(Jt + w / 360)),
    day_length_s: Math.round((w / 180) * 86400),
    polar: null,
  };
}

/* Equinoxes and solstices: Meeus, Astronomical Algorithms ch. 27, with periodic terms. */
const SEASON_TERMS: [number, number, number][] = [
  [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112],
  [156, 73.14, 45036.886], [136, 171.52, 22518.443], [77, 222.54, 65928.934], [74, 296.72, 3034.906],
  [70, 243.58, 9037.513], [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.232],
  [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417], [18, 155.12, 67555.328],
  [17, 288.79, 4562.452], [16, 198.04, 62894.029], [14, 199.76, 31436.921], [12, 95.39, 14577.848],
  [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074],
];
const SEASON_POLY: number[][] = [
  [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
  [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.00030],
  [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
  [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
];
export const SEASON_EVENTS = ['March equinox', 'June solstice', 'September equinox', 'December solstice'] as const;

/** ΔT (TT − UT) in seconds, Espenak–Meeus polynomials around the present. */
function deltaT(year: number): number {
  if (year >= 2005 && year < 2050) { const t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t - 6; }
  const u = (year - 1820) / 100; return -20 + 32 * u * u;
}

/** Instant of an equinox or solstice in a Gregorian year. k: 0 March, 1 June, 2 September, 3 December. */
export function seasonEvent(year: number, k: number): bigint {
  const Y = (year - 2000) / 1000;
  const c = SEASON_POLY[k];
  const jde0 = c[0] + c[1] * Y + c[2] * Y * Y + c[3] * Y ** 3 + c[4] * Y ** 4;
  const T = (jde0 - 2451545) / 36525;
  const W = (35999.373 * T - 2.47) * D2R;
  const dl = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);
  let S = 0;
  for (const [A, B, Cc] of SEASON_TERMS) S += A * Math.cos((B + Cc * T) * D2R);
  const jde = jde0 + (0.00001 * S) / dl;
  return msToNs(jdToMs(jde) - deltaT(year) * 1000);
}

const NORTH = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SOUTH = ['Autumn', 'Winter', 'Spring', 'Summer'];

export interface SeasonInfo {
  hemisphere: 'north' | 'south';
  name: string;
  started: { event: string; unixNs: bigint };
  next: { event: string; season: string; unixNs: bigint };
}

/** The astronomical season at an instant for a hemisphere. */
export function seasonAt(unixNs: bigint, hemisphere: 'north' | 'south' = 'north'): SeasonInfo {
  const y = new Date(Number(unixNs / 1_000_000n)).getUTCFullYear();
  const ev: { k: number; ns: bigint }[] = [];
  for (const yy of [y - 1, y, y + 1]) for (let k = 0; k < 4; k++) ev.push({ k, ns: seasonEvent(yy, k) });
  let i = ev.findIndex((e) => e.ns > unixNs) - 1;
  const cur = ev[i], nxt = ev[i + 1];
  const names = hemisphere === 'north' ? NORTH : SOUTH;
  return {
    hemisphere,
    name: names[cur.k],
    started: { event: SEASON_EVENTS[cur.k], unixNs: cur.ns },
    next: { event: SEASON_EVENTS[nxt.k], season: names[nxt.k], unixNs: nxt.ns },
  };
}

/** Every equinox and solstice between two instants. */
export function seasonEventsBetween(fromNs: bigint, toNs: bigint) {
  const y0 = new Date(Number(fromNs / 1_000_000n)).getUTCFullYear();
  const y1 = new Date(Number(toNs / 1_000_000n)).getUTCFullYear();
  const out: { event: string; k: number; unixNs: bigint }[] = [];
  for (let y = y0; y <= y1; y++) for (let k = 0; k < 4; k++) {
    const ns = seasonEvent(y, k);
    if (ns >= fromNs && ns < toNs) out.push({ event: SEASON_EVENTS[k], k, unixNs: ns });
  }
  return out;
}

/* ───────────── The people's Moon date ─────────────
   Machines use the true Moon date, which changes at the Moon day boundary.
   People label each local day with the Moon date in effect at local noon,
   so a whole local day carries one Moon date. A Moon day is 24h 58m, so about
   once every 25 days two local days share one Moon date. */


const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

export interface LocalMoonDate { year: number; moon: number; day: number; label: string; shared_with: string | null }

function noonMoon(date: string, zone: string) {
  const t = toMoon(fromSun(date, '12:00', zone));
  return { year: t.year, moon: t.moon, day: t.day, label: `${t.year}.${pad(t.moon)}.${pad(t.day)}` };
}

/** The Moon date for a local calendar day, by the local-noon rule. */
export function localMoonDate(date: string, zone: string): LocalMoonDate {
  const z = checkZone(zone);
  const today = noonMoon(date, z);
  const prev = addDays(date, -1), next = addDays(date, 1);
  const shared = noonMoon(prev, z).label === today.label ? prev : noonMoon(next, z).label === today.label ? next : null;
  return { ...today, shared_with: shared };
}
