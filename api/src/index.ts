import {
  SPEC_VERSION, EPOCH_UNIX_NS, LUNATION_NS, NUM, DEN, MOON_SECOND_SI, YEAR_DAYS, MOONS,
  toMoon, toUnixNs, formatMoonmark, parseMoonmark, moonmarkPath, truePhase, illumination, phaseName, unixNsToIso, yearInfo,
  moonLength, MoonRangeError, type MoonTime,
} from './moon.js';
import { lightAt, lightSeries, counterMs } from './light.js';
import { toSun, fromSun, dailySeries, sunDay, seasonAt, seasonEventsBetween, checkZone, SunError } from './sun.js';

export interface RateLimiter { limit(o: { key: string }): Promise<{ success: boolean }> }

/** Read-only key/value lookup (Upstash Redis, Vercel Global Config or similar). */
export interface KeyStore { get(key: string): Promise<string | null> }

export interface Env {
  /** Open tier, keyed by client IP. Optional: without it, no limit is enforced. */
  RATE_LIMITER?: RateLimiter;
  /** Keyed tier, keyed by API key. */
  RATE_LIMITER_KEYED?: RateLimiter;
  /** Store of valid API keys: key -> JSON { owner, plan }. Optional. */
  API_KEYS?: KeyStore;
  /** Accuracy of this deployment's clock, in ns (default 1,000,000 = 1 ms). */
  CLOCK_ACCURACY_NS?: string;
  /** Label for the clock source returned with Moonmarks (default "server-ntp"). */
  CLOCK_SOURCE?: string;
}

const API_VERSION = 'v1';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

// JSON with BigInt support (BigInts serialize as strings to keep full precision).
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, 'X-Moon-Spec': SPEC_VERSION, ...extra },
  });

/** Public page that opens a Moonmark link. */
const MARK_BASE = 'https://moon369.org/m/';

const NOW_CACHE = { 'Cache-Control': 'no-store' };
const FOREVER = { 'Cache-Control': 'public, max-age=31536000, immutable' };

/** Server time in Unix ns. the platform exposes millisecond time; finer digits come from the conversion. */
const nowUnixNs = (): bigint => BigInt(Date.now()) * 1_000_000n;

function moonBody(t: MoonTime, unixNs: bigint) {
  const ph = truePhase(unixNs);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    year: t.year,
    moon: t.moon,
    day: t.day,
    day_of_year: t.dayOfYear,
    moon_length_days: moonLength(t.moon),
    time: `${p(t.hour)}:${p(t.minute)}:${p(t.second)}`,
    moonmark: formatMoonmark(t),
    moonmark_url: MARK_BASE + moonmarkPath(formatMoonmark(t)),
    phase: { fraction: Math.round(ph * 1e6) / 1e6, illumination: Math.round(illumination(unixNs) * 1e4) / 1e4, name: phaseName(ph) },
    moon_ns: t.moonNs,
    unix_ns: unixNs,
    unix_ms: Number(unixNs / 1_000_000n),
    utc: unixNsToIso(unixNs),
    time_zone: null,
    dst: false,
  };
}

const markOf = (ns: bigint) => formatMoonmark(toMoon(ns));
const at = (ns: bigint | null, zone?: string) => ns === null ? null : ({
  moonmark: markOf(ns), unix_ns: ns, utc: unixNsToIso(ns), ...(zone ? { local: toSun(ns, zone).time } : {}),
});

/** Light and Dark: the day as people live it. Needs lat and lon; no time zone. */
function lightBody(ns: bigint, q: URLSearchParams) {
  const latS = q.get('lat'), lonS = q.get('lon');
  if (latS === null && lonS === null) return undefined;
  if (latS === null || lonS === null) throw new HttpError(400, 'missing_param', 'lat and lon go together');
  const lat = Number(latS), lon = Number(lonS);
  const ms = Number(ns / 1_000_000n);
  const r = lightAt(ms, lat, lon);
  const mk = (m: number) => at(BigInt(Math.round(m)) * 1_000_000n);
  return {
    location: { lat, lon },
    phase: r.phase, counter: r.counter, label: r.label, remaining: r.remaining, length: r.phase_length, polar: r.polar,
    began: mk(r.began_ms), ends: mk(r.ends_ms),
    first_light: mk(r.day_start_ms),
  };
}

/** Sun: the local layer. Needs tz for the local clock, lat and lon for the day and the season. */
function sunBody(ns: bigint, q: URLSearchParams, dateOverride?: string) {
  const tz = q.get('tz');
  const latS = q.get('lat'), lonS = q.get('lon');
  if (!tz) return undefined;
  if ((latS === null) !== (lonS === null)) throw new HttpError(400, 'missing_param', 'lat and lon go together');
  const zone = tz ? checkZone(tz) : undefined;
  const local = zone ? toSun(ns, zone) : undefined;
  const out: Record<string, unknown> = { zone: zone ?? null, ...(local ? { date: local.date, time: local.time, weekday: local.weekday, utc_offset: local.utc_offset, dst: local.dst } : {}) };
  const lat = latS === null ? null : Number(latS), lon = lonS === null ? null : Number(lonS);
  const hemi = lat !== null && lat < 0 ? 'south' : 'north';
  if (lat !== null && lon !== null) {
    const date = dateOverride ?? local?.date ?? unixNsToIso(ns).slice(0, 10);
    const d = sunDay(date, lat, lon);
    out.location = { lat, lon };
    out.day = {
      date,
      sunrise: at(d.sunrise, zone), solar_noon: at(d.solar_noon, zone), sunset: at(d.sunset, zone),
      day_length: `${String(Math.floor(d.day_length_s / 3600)).padStart(2, '0')}:${String(Math.floor(d.day_length_s % 3600 / 60)).padStart(2, '0')}`,
      polar: d.polar,
    };
  }
  const se = seasonAt(ns, hemi);
  const days = Number((se.next.unixNs - ns) / 1_000_000n) / 86_400_000;
  out.season = {
    name: se.name, hemisphere: se.hemisphere, ...(lat === null ? { hemisphere_assumed: true } : {}),
    started: { event: se.started.event, ...at(se.started.unixNs, zone) },
    next: { event: se.next.event, season: se.next.season, in_days: Math.round(days * 10) / 10, ...at(se.next.unixNs, zone) },
  };
  return out;
}

function parseIntParam(v: string | null, name: string, required = true): number | undefined {
  if (v === null || v === '') {
    if (required) throw new HttpError(400, 'missing_param', `${name} is required`);
    return undefined;
  }
  if (!/^-?\d+$/.test(v)) throw new HttpError(400, 'bad_param', `${name} must be an integer`);
  return Number(v);
}

function parseBigParam(v: string, name: string): bigint {
  if (!/^-?\d+$/.test(v)) throw new HttpError(400, 'bad_param', `${name} must be an integer`);
  return BigInt(v);
}

/** Accepts unix_ns, unix (ms) or utc (ISO 8601). */
function unixNsFromQuery(q: URLSearchParams): bigint | null {
  const ns = q.get('unix_ns');
  if (ns) return parseBigParam(ns, 'unix_ns');
  const ms = q.get('unix');
  if (ms) return parseBigParam(ms, 'unix') * 1_000_000n;
  const iso = q.get('utc');
  if (iso) {
    const m = /^(.*?)(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/.exec(iso.trim());
    const base = Date.parse(m ? `${m[1]}${m[3]}` : iso);
    if (Number.isNaN(base)) throw new HttpError(400, 'bad_param', 'utc must be an ISO 8601 timestamp with a Z or offset');
    const frac = m && m[2] ? BigInt(m[2].padEnd(9, '0')) : 0n;
    return BigInt(base) * 1_000_000n + frac;
  }
  return null;
}

function moonInputFromQuery(q: URLSearchParams) {
  const mark = q.get('moonmark') ?? q.get('stamp');
  if (mark) return parseMoonmark(mark);
  const time = q.get('time') ?? '00:00:00';
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/.exec(time);
  if (!tm) throw new HttpError(400, 'bad_param', 'time must be HH:MM:SS or HH:MM:SS.fraction');
  return {
    year: parseIntParam(q.get('year'), 'year')!,
    moon: parseIntParam(q.get('moon'), 'moon')!,
    day: parseIntParam(q.get('day'), 'day')!,
    hour: +tm[1], minute: +tm[2], second: tm[3] ? +tm[3] : 0,
    nanosecond: tm[4] ? +tm[4].padEnd(9, '0') : 0,
  };
}

const SPEC = {
  spec_version: SPEC_VERSION,
  moon_second_si: MOON_SECOND_SI,
  moon_second_si_exact: { numerator: DEN, denominator: NUM, note: 'SI seconds per Moon second = numerator / denominator' },
  seconds_per_minute: 60,
  minutes_per_hour: 60,
  hours_per_day: 24,
  lune: { name: 'lune', definition: 'A lune is a Moon day: one 369th of a Moon year, 86,400 Moon seconds. It turns over at the same instant everywhere. 369 lunes make 13 moons, locked to the real moon. A lune is not daylight; Light and Dark track the sun.', moon_seconds: 86_400, si_seconds: Math.round(86_400 * Number(DEN) / Number(NUM) * 1000) / 1000, per_year: YEAR_DAYS },
  days_per_year: YEAR_DAYS,
  moons_per_year: MOONS,
  moon_lengths_days: Array.from({ length: MOONS }, (_, i) => moonLength(i + 1)),
  mean_lunation_ns: LUNATION_NS,
  epoch_unix_ns: EPOCH_UNIX_NS,
  epoch_utc: unixNsToIso(EPOCH_UNIX_NS),
  time_base: 'Unix time (no leap seconds)',
  time_zones: null,
  dst: false,
  roles: { moon: 'The engine and the calendar: one continuous count underneath everything, read as the date, the 13 moons and the phase.', moonmark: 'One exact moment on the Moon engine, the same everywhere: YEAR.MM.DD HH:MM:SS.NNNNNNNNN. For events, records and systems.', light: 'How people live the day. The Light counter starts at 00:00:00 at first light and runs to sunset; the Dark counter starts at sunset and runs to the next first light. Counters tick in Moon seconds. Needs only where you stand: no time zones.' },
  date_rule: 'The Moon date is global: one date for the whole planet, and it changes at the Moon day boundary at the same instant everywhere. Light and Dark never change the date; they only count the local day. Polar fallback: when the sun neither rises nor sets, the counters start at solar midnight.',
  light_layer: 'Light and Dark counters from sunrise and sunset, in Moon seconds. Only a location is needed. /v1/sun remains for showing the old local clock beside it.',
  license: 'MIT',
};

async function authAndLimit(req: Request, env: Env): Promise<{ plan: string } | Response> {
  const auth = req.headers.get('Authorization');
  const key = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (key) {
    if (!env.API_KEYS) return json({ error: { code: 'keys_disabled', message: 'This deployment does not accept API keys' } }, 400);
    const rec = await env.API_KEYS.get(key);
    if (!rec) return json({ error: { code: 'invalid_key', message: 'Unknown API key' } }, 401);
    const plan = (() => { try { return JSON.parse(rec).plan ?? 'keyed'; } catch { return 'keyed'; } })();
    if (env.RATE_LIMITER_KEYED && !(await env.RATE_LIMITER_KEYED.limit({ key })).success) {
      return json({ error: { code: 'rate_limited', message: 'Key rate limit reached' } }, 429, { 'Retry-After': '60' });
    }
    return { plan };
  }
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anonymous';
  if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: ip })).success) {
    return json({ error: { code: 'rate_limited', contact: 'moon369org@proton.me', message: 'Open rate limit reached (120 requests a minute). For higher limits email moon369org@proton.me, or run the MIT reference code locally.' } }, 429, { 'Retry-After': '60' });
  }
  return { plan: 'open' };
}

export async function handle(req: Request, env: Env = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: { code: 'method_not_allowed', message: 'Use GET' } }, 405);

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;

  if (path === '/' ) return json({ name: 'Moon API', version: API_VERSION, spec: SPEC_VERSION, docs: '/v1/spec', endpoints: ['/v1/now', '/v1/moonmark', '/v1/m/{moonmark}', '/v1/convert', '/v1/to-unix', '/v1/year/{year}', '/v1/light', '/v1/schedule', '/v1/seasons/{year}', '/v1/spec'] });
  if (path === '/health') return json({ ok: true });

  const gate = await authAndLimit(req, env);
  if (gate instanceof Response) return gate;
  const planHdr = { 'X-Moon-Plan': gate.plan };

  try {
    switch (true) {
      case path === `/${API_VERSION}/spec`:
        return json(SPEC, 200, { ...FOREVER, ...planHdr });

      case path === `/${API_VERSION}/now`: {
        const ns = nowUnixNs();
        const sun = sunBody(ns, q); const light = lightBody(ns, q);
        return json({ ...moonBody(toMoon(ns), ns), ...(light ? { light } : {}), ...(sun ? { sun } : {}) }, 200, { ...NOW_CACHE, ...planHdr });
      }

      case path === `/${API_VERSION}/moonmark` || path === `/${API_VERSION}/stamp`: {
        const given = q.get('unix_ns');
        const ns = given ? parseBigParam(given, 'unix_ns') : nowUnixNs();
        const t = toMoon(ns);
        return json({
          moonmark: formatMoonmark(t),
          moonmark_url: MARK_BASE + moonmarkPath(formatMoonmark(t)),
          moon_ns: t.moonNs,
          unix_ns: ns,
          utc: unixNsToIso(ns),
          // When the caller supplies the instant, accuracy is theirs to state.
          accuracy_ns: given ? null : Number(env.CLOCK_ACCURACY_NS ?? 1_000_000),
          clock: given ? 'client' : (env.CLOCK_SOURCE ?? 'server-ntp'),
        }, 200, { ...(given ? FOREVER : NOW_CACHE), ...planHdr });
      }

      case path === `/${API_VERSION}/convert`: {
        let ns = unixNsFromQuery(q);
        const sunIn = q.get('sun');
        if (ns === null && sunIn) {
          const tz = q.get('tz');
          if (!tz) throw new HttpError(400, 'missing_param', 'sun needs tz, for example tz=America/Denver');
          const m = /^(\d{4}-\d{2}-\d{2})[T ](.+)$/.exec(sunIn);
          if (!m) throw new HttpError(400, 'bad_param', 'sun must be a local date and time: YYYY-MM-DDTHH:MM[:SS]');
          ns = fromSun(m[1], m[2], tz);
        }
        if (ns === null) throw new HttpError(400, 'missing_param', 'Provide unix (ms), unix_ns, utc, or sun with tz');
        const t = toMoon(ns);
        if (q.get('format') === 'string') {
          return new Response(formatMoonmark(t), { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...FOREVER, ...planHdr } });
        }
        const sun = sunBody(ns, q); const light = lightBody(ns, q);
        return json({ ...moonBody(t, ns), ...(light ? { light } : {}), ...(sun ? { sun } : {}) }, 200, { ...FOREVER, ...planHdr });
      }

      case path === `/${API_VERSION}/light`: {
        if (q.get('lat') === null || q.get('lon') === null) throw new HttpError(400, 'missing_param', 'light needs lat and lon');
        const given = unixNsFromQuery(q) ?? (q.get('moonmark') ? toUnixNs(parseMoonmark(q.get('moonmark')!)) : null);
        const ns = given ?? nowUnixNs();
        return json({ moonmark: markOf(ns), unix_ns: ns, light: lightBody(ns, q) }, 200, { ...(given !== null ? FOREVER : NOW_CACHE), ...planHdr });
      }

      case path === `/${API_VERSION}/sun`: {
        if (!q.get('tz') && q.get('lat') === null) throw new HttpError(400, 'missing_param', 'Provide tz, or lat and lon, or both');
        const date = q.get('date') ?? undefined;
        let ns = nowUnixNs();
        if (date) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'bad_param', 'date must be YYYY-MM-DD');
          ns = q.get('tz') ? fromSun(date, '12:00', q.get('tz')!) : BigInt(Date.parse(date + 'T12:00:00Z')) * 1_000_000n;
        }
        const q2 = new URLSearchParams(q); if (!q2.get('tz')) q2.set('tz', 'UTC');
        const sun = sunBody(ns, q2, date)!;
        return json({ moon: { moonmark: markOf(ns), unix_ns: ns }, sun }, 200, { ...(date ? FOREVER : NOW_CACHE), ...planHdr, Deprecation: 'true', Link: '</v1/light>; rel="successor-version"' });
      }

      case path === `/${API_VERSION}/schedule`: {
        if (q.get('light') || q.get('dark')) {
          const phase = q.get('light') ? 'light' : 'dark';
          const c = q.get(phase)!;
          if (q.get('lat') === null || q.get('lon') === null) throw new HttpError(400, 'missing_param', 'schedule needs lat and lon');
          try { counterMs(c); } catch { throw new HttpError(400, 'bad_param', `${phase} must be a counter like 06:45`); }
          const days = parseIntParam(q.get('days'), 'days', false) ?? 7;
          if (days < 1 || days > 400) throw new HttpError(400, 'bad_param', 'days must be 1 to 400');
          const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
          const fromNs = unixNsFromQuery(q) ?? (q.get('from') ? toUnixNs(parseMoonmark(q.get('from')!)) : nowUnixNs());
          const occ = lightSeries(Number(fromNs / 1_000_000n), phase, c, lat, lon, days).map((o) => {
            if (o.ms === null) return { skipped: true, reason: phase === 'light' ? 'not that much light this day' : 'not that much dark this day', first_light: at(BigInt(Math.round(o.day_start_ms)) * 1_000_000n)!.moonmark };
            const a = at(BigInt(Math.round(o.ms)) * 1_000_000n)!;
            return { moon_date: a.moonmark.slice(0, a.moonmark.indexOf(' ')), label: `${phase === 'light' ? 'Light' : 'Dark'} ${c}`, ...a };
          });
          return json({ rule: { [phase]: c, repeat: 'daily', location: { lat, lon } }, occurrences: occ }, 200, { ...FOREVER, ...planHdr });
        }
        const tz = q.get('tz'); const time = q.get('time');
        if (!tz || !time) throw new HttpError(400, 'missing_param', 'schedule needs light or dark (a counter like 06:45) with lat and lon');
        const days = parseIntParam(q.get('days'), 'days', false) ?? 7;
        if (days < 1 || days > 400) throw new HttpError(400, 'bad_param', 'days must be 1 to 400');
        const from = q.get('from') ?? toSun(nowUnixNs(), tz).date;
        
        const zone = checkZone(tz);
        const occurrences = dailySeries(from, time, zone, days).map((o) => o.unixNs === null
          ? { sun_date: o.sunDate, skipped: true }
          : (() => { const a = at(o.unixNs, zone)!; return { sun_date: o.sunDate, sun_time: time, moon_date: a.moonmark.slice(0, a.moonmark.indexOf(' ')), ...a }; })());
        return json({ rule: { time, tz: zone, repeat: 'daily' }, occurrences }, 200, { ...FOREVER, ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/seasons/`): {
        const y = parseIntParam(path.split('/').pop() ?? null, 'year')!;
        const start = toUnixNs({ year: y, moon: 1, day: 1, hour: 0, minute: 0, second: 0, nanosecond: 0 });
        const end = toUnixNs({ year: y + 1, moon: 1, day: 1, hour: 0, minute: 0, second: 0, nanosecond: 0 });
        const events = seasonEventsBetween(start, end).map((e) => ({ event: e.event, ...at(e.unixNs) }));
        return json({ moon_year: y, events }, 200, { ...FOREVER, ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/m/`): {
        // Resolve a Moonmark link (what a Moonmark QR code points to).
        const raw = decodeURIComponent(path.slice(`/${API_VERSION}/m/`.length));
        const ns = toUnixNs(parseMoonmark(raw));
        const sun = sunBody(ns, q); const light = lightBody(ns, q);
        return json({ ...moonBody(toMoon(ns), ns), ...(light ? { light } : {}), ...(sun ? { sun } : {}) }, 200, { ...FOREVER, ...planHdr });
      }

      case path === `/${API_VERSION}/to-unix`: {
        const input = moonInputFromQuery(q);
        const ns = toUnixNs(input);
        return json({ input, unix_ns: ns, unix_ms: Number(ns / 1_000_000n), utc: unixNsToIso(ns) }, 200, { ...FOREVER, ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/year/`): {
        const y = parseIntParam(path.split('/').pop() ?? null, 'year')!;
        return json(yearInfo(y), 200, { ...FOREVER, ...planHdr });
      }
    }
    return json({ error: { code: 'not_found', message: `No route ${path}` } }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
    if (e instanceof SunError) return json({ error: { code: e.code, message: e.message } }, 400);
    if (e instanceof MoonRangeError) return json({ error: { code: 'out_of_range', message: e.message } }, 400);
    return json({ error: { code: 'internal', message: 'Unexpected error' } }, 500);
  }
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
};
