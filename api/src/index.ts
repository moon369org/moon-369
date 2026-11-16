import { createHash, timingSafeEqual, X509Certificate } from 'node:crypto';
import {
  SPEC_VERSION, EPOCH_UNIX_NS, LUNATION_NS, NUM, DEN, MOON_SECOND_SI, YEAR_DAYS, MOONS,
  toMoon, toUnixNs, formatMoonmark, parseMoonmark, moonmarkPath, truePhase, illumination, moonTilt, phaseName, unixNsToIso, yearInfo,
  moonLength, MoonRangeError, type MoonTime, moonNsOf, moonNsToUnixNs, MOON_DAY_NS, NS_PER_SECOND,
} from './moon.js';
import { cardSvg, shareSvg } from './card.js';
import { TsaSigner, TsaReject, parseRequest as parseTsq, issue as issueTst, reject as tsaReject, FAIL as TSA_FAIL, TSA_POLICY, TSA_EXT_MOONMARK } from './tsa.js';
import { MOON_ROOT_PEM } from './tsa-certs.js';
import { allEclipses, indexAfter, publicEclipse, eclipseByDate, eclipseCardSvg, ymdOf, tdTime, ECLIPSE_TYPES, type EclipseType } from './eclipses.js';
import { eclipseIcon } from './eclipse-icon.js';
import { driftByCentury, gapHours, trueNewMoonMs, gridNewMoonMs, lunationNear } from './lunation.js';
import { parseNight, nightFacts, nightSvg, NightParamError } from './night.js';
import { hashKey, newKey, type KeyWriter } from './keys.js';
import { mcp } from './mcp.js';
import { eventLinks, eventIcs, cleanEventName } from './event.js';
import { RESEAL, resealFingerprint } from './reseal.js';
import { parseStatement, statementSha, newPrintIds, type EditionStore } from './editions.js';
import { makeRegistration, publicRegistration, isPhash, phashKind, hamming, bands, SIMILAR_BITS, registrantSlug, type RegistryStore, type Registration } from './registry.js';
import { svgToPng } from './png.js';
import { Signer, verifyReceipt, isSha256Hex, RECEIPT_V1, RECEIPT_V2, RECEIPT_V3, RECEIPT_VERSIONS, PQ_ALG, type Receipt } from './receipt.js';
import { QUICKNET, BEACON_NETWORK, roundTimeNs, type Beacon, type Chain } from './beacon.js';
import { TIDELINE, record, sealDue, upgradeBitcoin, checkpointSoon, proofFor, parseLune, luneLabel, luneOf, luneEndNs, tideBytes, type TideStore, type Anchorer, type BitcoinStamper } from './tideline.js';

/** max overrides the limiter's default requests per minute (used for per-key limits). */
export interface RateLimiter { limit(o: { key: string; max?: number }): Promise<{ success: boolean }> }

/** Read-only lookup of API keys by the SHA-256 hex of the key -> JSON { owner, plan, per_min, active }. */
export interface KeyStore { get(keyHash: string): Promise<string | null> }

export interface Env {
  /** Open tier, keyed by client IP. Optional: without it, no limit is enforced. */
  RATE_LIMITER?: RateLimiter;
  /** Keyed tier, keyed by API key. */
  RATE_LIMITER_KEYED?: RateLimiter;
  /** Open tier, signing only (sign, tsa, evidence): per minute and per day, keyed by IP. API keys skip these. */
  SIGN_LIMIT_MIN?: RateLimiter;
  SIGN_LIMIT_DAY?: RateLimiter;
  /** The numbers behind SIGN_LIMIT_MIN and SIGN_LIMIT_DAY, for messages. */
  SIGN_LIMITS?: { per_min: number; per_day: number };
  /** Store of valid API keys, looked up by SHA-256 of the key. Optional. */
  API_KEYS?: KeyStore;
  /** Accuracy of this deployment's clock, in ns (default 1,000,000 = 1 ms). */
  CLOCK_ACCURACY_NS?: string;
  /** Label for the clock source returned with Moonmarks (default "server-ntp"). */
  CLOCK_SOURCE?: string;
  /** Signs Moonmark receipts. Without it, /v1/sign answers 503. */
  SIGNER?: Signer;
  /** Latest drand beacon for v2 receipts. Without it, or if it returns null, /v1/sign issues v1 receipts. */
  BEACON?: (nowNs: bigint) => Promise<Beacon | null>;
  /** The Tideline store. Without it, receipts aren't logged and /v1/tideline answers 503. */
  TIDES?: TideStore;
  /** Anchors each sealed tide (XRP Ledger). Optional. */
  ANCHOR?: Anchorer;
  /** Runs work after the response is sent (Vercel waitUntil). Used for checkpoints. */
  DEFER?: (p: Promise<unknown>) => void;
  /** Anchors each tide in Bitcoin through OpenTimestamps. Optional. */
  BITCOIN?: BitcoinStamper;
  /** Required on /v1/tideline/seal (Vercel Cron sends it as a Bearer token). */
  CRON_SECRET?: string;
  /** Beacon network to check against (default drand quicknet). Tests only. */
  BEACON_CHAIN?: Chain;
  /** Who registered which fingerprint: powers /v1/lookup. Without it, lookups answer 503. */
  REGISTRY?: RegistryStore;
  /** RFC 3161 Time-Stamp Authority signer (MOON_TSA_KEY + certificate). Optional. */
  TSA?: TsaSigner;
  /** Where self-serve keys are written (POST /v1/api-keys). Without it, that endpoint answers 503. */
  KEYS_WRITE?: KeyWriter;
  /** New self-serve keys per IP (a day). */
  KEY_CREATE_LIMIT?: RateLimiter;
  /** Signing on free self-serve keys, per key per day. */
  FREE_SIGN_DAY?: RateLimiter;
  /** All requests a day per free key: personal projects fit, businesses need a paid key. */
  FREE_REQ_DAY?: RateLimiter;
  /** The open tier's per-minute limit, for error messages. */
  OPEN_PER_MIN?: number;
  /** The numbers behind the free plan, for messages and the key response. */
  FREE_LIMITS?: { per_min: number; sign_per_day: number; req_per_day?: number };
  /** Edition registry for certificates of authenticity. Without it, /v1/editions answers 503. */
  EDITIONS?: EditionStore;
  /** Admin token (MOON_ADMIN_TOKEN) for issuing verified business keys in one call: POST /v1/admin/keys. Without it, admin routes answer 404. */
  ADMIN_TOKEN?: string;
  /** Retired public keys that old receipts may still use: key_id -> base64url raw key. */
  RETIRED_KEYS?: Record<string, string>;
}

const API_VERSION = 'v1';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    cycle: t.cycle,
    year: t.year,                // same as cycle, kept for compatibility
    moon: t.moon,
    day: t.day,
    day_of_cycle: t.dayOfCycle,
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
    cycle: parseIntParam(q.get('cycle') ?? q.get('year'), 'cycle')!,
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
  lune: { name: 'lune', definition: 'A lune is a Moon day: one 369th of a cycle, 86,400 Moon seconds. It turns over at the same instant everywhere. 369 lunes make 13 moons, locked to the real moon. It is a unit of the Moon count, not daylight.', moon_seconds: 86_400, si_seconds: Math.round(86_400 * Number(DEN) / Number(NUM) * 1000) / 1000, per_year: YEAR_DAYS },
  cycle: { name: 'cycle', definition: 'A cycle is Moon\'s year: 13 moons and 369 lunes, about 383.9 days. Cycles count from cycle 0, which starts with the first mean new moon of 0 AD. Responses also carry it as year, for compatibility.', lunes: YEAR_DAYS, moons: MOONS },
  lunes_per_cycle: YEAR_DAYS,
  moons_per_cycle: MOONS,
  days_per_year: YEAR_DAYS,
  moons_per_year: MOONS,
  moon_lengths_days: Array.from({ length: MOONS }, (_, i) => moonLength(i + 1)),
  mean_lunation_ns: LUNATION_NS,
  epoch_unix_ns: EPOCH_UNIX_NS,
  epoch_utc: unixNsToIso(EPOCH_UNIX_NS),
  time_base: 'Unix time (no leap seconds)',
  time_zones: null,
  dst: false,
  roles: { moon: 'One continuous count of time, locked to the real moon, read as the date (cycle, moon, lune) and the phase.', moonmark: 'One exact moment on the Moon count, the same everywhere: CYCLE.MM.DD HH:MM:SS.NNNNNNNNN.' },
  date_rule: 'The Moon date is global: one date worldwide. A lune turns over at the same instant everywhere.',
  illumination: { meaning: 'Fraction of the moon\'s disc lit by the sun at that instant, seen from Earth (0 to 1). Not the moon\'s age.', method: 'Phase angle from the Moon-Sun elongation, the Moon latitude and the Earth-Moon and Earth-Sun distances, using the principal periodic terms of Meeus, Astronomical Algorithms, ch. 47-48', checked_against: 'PyEphem: within 0.05 percentage points (mean 0.01) at 3,000 random moments, 2000-2050' },
  signing: { receipt: 'moonmark-receipt/3', alg: 'Ed25519 + ML-DSA-65 (hybrid)', hybrid: 'v3 receipts carry two signatures over the same bytes: Ed25519 and ML-DSA-65 (NIST FIPS 204, post-quantum). A full v3 receipt is valid only if both check out, so it stays unforgeable while either algorithm holds. A v3 receipt without its ML-DSA signature (as in a short link) is checked with Ed25519 only and reported with post_quantum: false.', upgrades: 'Moon is designed to upgrade its cryptography. Every receipt names its version, new versions are added through the proposals process, and every version ever issued stays verifiable: old keys stay published as retired.', versions: { 'moonmark-receipt/1': 'Ed25519', 'moonmark-receipt/2': 'Ed25519 + drand beacon', 'moonmark-receipt/3': 'Ed25519 + ML-DSA-65, drand beacon when available' }, signed_bytes: 'receipt, "sha256:" + hex, moonmark, unix_ns, key_id, then "drand-quicknet:" + round + ":" + beacon signature hex (v2, and v3 when present), then "ml-dsa-65:" + post-quantum key_id (v3), joined by newlines (UTF-8)', beacon: { network: BEACON_NETWORK, meaning: 'The latest drand quicknet round Moon had seen when it signed. Its value could not be known before it was published, so the receipt was signed after that round. Check it offline with the League of Entropy public key.', chain_hash: QUICKNET.hash, public_key: QUICKNET.public_key, period_s: QUICKNET.period, genesis_time: QUICKNET.genesis_time, scheme: QUICKNET.scheme }, v1: 'moonmark-receipt/1 receipts have no beacon and stay valid', key_id: 'first 16 hex of SHA-256 of the raw 32-byte public key', keys: '/v1/keys', sign: 'POST /v1/sign {"sha256":"<hex>"}', verify: 'POST /v1/verify {"receipt":{...}}' },
  license: 'MIT',
};

type Gate = { plan: string; owner?: string; per_min?: number; verified?: boolean };

async function authAndLimit(req: Request, env: Env, signing = false): Promise<Gate | Response> {
  const auth = req.headers.get('Authorization');
  const key = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (key) {
    if (!env.API_KEYS) return json({ error: { code: 'keys_disabled', message: 'This deployment does not accept API keys' } }, 400);
    const hash = hashKey(key);
    const raw = await env.API_KEYS.get(hash);
    let rec: { plan?: string; owner?: string; per_min?: number; active?: boolean; verified?: boolean } | null = null;
    try { rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
    if (!rec) return json({ error: { code: 'invalid_key', message: 'Unknown API key' } }, 401);
    if (rec.active === false) return json({ error: { code: 'key_disabled', contact: 'moon369org@proton.me', message: 'This API key is switched off. Email moon369org@proton.me.' } }, 403);
    const per_min = Number.isFinite(rec.per_min) && rec.per_min! > 0 ? Math.floor(rec.per_min!) : undefined;
    if (env.RATE_LIMITER_KEYED && !(await env.RATE_LIMITER_KEYED.limit({ key: hash.slice(0, 32), max: per_min })).success) {
      return json({ error: { code: 'rate_limited', contact: 'moon369org@proton.me', message: `Key rate limit reached${per_min ? ` (${per_min} requests a minute)` : ''}. For a higher limit email moon369org@proton.me.` } }, 429, { 'Retry-After': '60' });
    }
    const untilMidnight = String(86400 - Math.floor(Date.now() / 1000) % 86400);
    if (rec.plan === 'free' && env.FREE_REQ_DAY && !(await env.FREE_REQ_DAY.limit({ key: hash.slice(0, 32) })).success) {
      const n = env.FREE_LIMITS?.req_per_day ?? 5000;
      return json({ error: { code: 'daily_limit', contact: 'moon369org@proton.me', message: `Free key daily limit reached (${n} requests a day, resets at 00:00 UTC). Building something bigger? Email moon369org@proton.me for a business key.` } }, 429, { 'Retry-After': untilMidnight });
    }
    if (signing && rec.plan === 'free' && env.FREE_SIGN_DAY && !(await env.FREE_SIGN_DAY.limit({ key: hash.slice(0, 32) })).success) {
      const n = env.FREE_LIMITS?.sign_per_day ?? 500;
      return json({ error: { code: 'sign_daily_limit', contact: 'moon369org@proton.me', message: `Free key signing limit reached (${n} a day). For more, email moon369org@proton.me for a business key.` } }, 429, { 'Retry-After': untilMidnight });
    }
    // Hand-issued keys are verified by Moon; self-serve keys carry whatever name was typed, so they are not.
    return { plan: rec.plan ?? 'keyed', owner: rec.owner, per_min, verified: rec.verified !== false };
  }
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anonymous';
  if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: ip })).success) {
    return json({ error: { code: 'rate_limited', contact: 'moon369org@proton.me', message: `Open rate limit reached (${env.OPEN_PER_MIN ?? 120} requests a minute). For higher limits email moon369org@proton.me, or run the MIT reference code locally.` } }, 429, { 'Retry-After': '60' });
  }
  if (signing) {
    // Signing is the paid product: the open tier gets enough to try it; volume needs an API key.
    const L = env.SIGN_LIMITS ?? { per_min: 5, per_day: 50 };
    const msg = (what: string) => `Free signing limit reached (${what}). Signing at volume needs an API key: email moon369org@proton.me.`;
    if (env.SIGN_LIMIT_MIN && !(await env.SIGN_LIMIT_MIN.limit({ key: ip })).success)
      return json({ error: { code: 'sign_rate_limited', contact: 'moon369org@proton.me', message: msg(`${L.per_min} a minute`) } }, 429, { 'Retry-After': '60' });
    if (env.SIGN_LIMIT_DAY && !(await env.SIGN_LIMIT_DAY.limit({ key: ip })).success)
      return json({ error: { code: 'sign_daily_limit', contact: 'moon369org@proton.me', message: msg(`${L.per_day} a day`) } }, 429, { 'Retry-After': String(86400 - Math.floor(Date.now() / 1000) % 86400) });
  }
  return { plan: 'open' };
}


// ---------- search ----------
/** What anyone may see of a registration found by time: everything for verified names, only the moment for the rest. */
function searchView(r: Registration) {
  if (r.registrant_verified) return { ...publicRegistration(r), sha256: r.sha256 };
  return { moonmark: r.moonmark, utc: new Date(Number(BigInt(r.unix_ns) / 1_000_000n)).toISOString(), registrant: r.registrant === 'anonymous' ? 'anonymous' : 'unverified', registrant_verified: false };
}
/** A Moonmark or a UTC date/time as a window in Unix ms: as wide as the precision given (a lune, a minute, a second). */
function searchWindow(q: string): { from: number; to: number; label: string } | null {
  const mm = /^(-?\d+)\.(\d{1,2})\.(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?)?$/.exec(q);
  if (mm) {
    const t = parseMoonmark(`${mm[1]}.${mm[2]}.${mm[3]}` + (mm[4] ? ` ${mm[4]}:${mm[5]}` + (mm[6] ? `:${mm[6]}` : '') : ''));
    t.nanosecond = 0;
    const start = moonNsOf(t), unit = mm[6] ? NS_PER_SECOND : mm[5] ? 60n * NS_PER_SECOND : MOON_DAY_NS;
    const a = moonNsToUnixNs(start), b = moonNsToUnixNs(start + unit);
    return { from: Number(a / 1_000_000n), to: Number(b / 1_000_000n), label: mm[6] ? 'second' : mm[5] ? 'minute' : 'lune' };
  }
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?)?$/.exec(q);
  if (iso) {
    const from = Date.parse(iso[1] + 'T' + (iso[2] ? `${iso[2]}:${iso[3]}:${iso[4] ?? '00'}` : '00:00:00') + 'Z');
    if (!Number.isFinite(from)) return null;
    const span = iso[4] ? 1000 : iso[2] ? 60_000 : 86_400_000;
    return { from, to: from + span, label: iso[4] ? 'second' : iso[2] ? 'minute' : 'utc_day' };
  }
  return null;
}

function cleanText(x: unknown, max: number): string | null {
  if (typeof x !== 'string') return null;
  const t = x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return t || null;
}
/** Who is registering: the API key owner (verified only for keys Moon issued), plus what they say about the file. */
function registrantOf(gate: Gate) {
  const named = gate.plan !== 'open' && !!gate.owner;
  return { registrant: named ? gate.owner! : 'anonymous', registrant_verified: named && gate.verified === true };
}
function whoFrom(body: Record<string, unknown>, gate: Gate): Who {
  const ph = typeof body.phash === 'string' ? body.phash.toLowerCase() : null;
  return {
    ...registrantOf(gate),
    on_behalf_of: cleanText(body.on_behalf_of, 80),
    label: cleanText(body.label, 120),
    phash: isPhash(ph) ? ph : null,
  };
}

/**
 * Admin: issue a verified business key in one call, or switch one off or on. Moon's own tool (scripts/moon-key.ps1) calls these.
 *   POST /v1/admin/keys      {"owner":"Acme","plan":"business","per_min":300,"email":"...","note":"..."}  -> the new key, shown once
 *   POST /v1/admin/keys/off  {"key":"moon_..."} or {"key_hash":"<sha256>"}
 *   POST /v1/admin/keys/on   same
 * Needs X-Moon-Admin: <MOON_ADMIN_TOKEN>. Without the token set, these routes don't exist (404).
 */
async function adminRoute(req: Request, env: Env, path: string): Promise<Response> {
  const notFound = () => json({ error: { code: 'not_found', message: 'No such endpoint' } }, 404);
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return notFound();
  const given = req.headers.get('X-Moon-Admin') ?? '';
  const a = createHash('sha256').update(given).digest(), b = createHash('sha256').update(env.ADMIN_TOKEN).digest();
  if (!given || !timingSafeEqual(a, b)) return json({ error: { code: 'forbidden', message: 'Wrong admin token' } }, 403);
  const noStore = { 'Cache-Control': 'no-store' };
  try {
    if (!env.KEYS_WRITE?.set || !env.KEYS_WRITE.read) throw new HttpError(503, 'keys_unavailable', 'The key store is not connected on this deployment');
    const body = await readJson(req);
    if (path === `/${API_VERSION}/admin/keys`) {
      const owner = cleanText(body.owner, 80);
      if (!owner || owner.length < 2) throw new HttpError(400, 'bad_param', 'owner: the verified name registrations will show, 2 to 80 characters');
      const plan = cleanText(body.plan, 32) ?? 'business';
      if (!/^[a-z][a-z0-9-]{1,31}$/.test(plan) || plan === 'free' || plan === 'open') throw new HttpError(400, 'bad_param', 'plan: a lowercase plan name such as business or pro (not free or open)');
      const per_min = body.per_min === undefined ? 300 : Number(body.per_min);
      if (!Number.isInteger(per_min) || per_min < 1 || per_min > 100_000) throw new HttpError(400, 'bad_param', 'per_min: whole requests a minute, 1 to 100000');
      const email = cleanText(body.email, 200), note = cleanText(body.note, 300);
      const key = newKey(), hash = hashKey(key);
      const ok = await env.KEYS_WRITE.put(hash, { owner, plan, per_min, verified: true, email: email ?? undefined, note: note ?? undefined, created: new Date().toISOString() });
      if (!ok) throw new HttpError(500, 'key_failed', 'Could not create a key. Try again.');
      return json({ key, key_hash: hash, owner, owner_verified: true, plan, per_min, note: 'Shown once. Only its SHA-256 is stored. Send it as Authorization: Bearer <key>. Works right away, no redeploy.' }, 201, noStore);
    }
    const on = path === `/${API_VERSION}/admin/keys/on`;
    if (on || path === `/${API_VERSION}/admin/keys/off`) {
      const hash = typeof body.key === 'string' && body.key.startsWith('moon_') ? hashKey(body.key.trim())
        : typeof body.key_hash === 'string' && /^[0-9a-f]{64}$/i.test(body.key_hash) ? body.key_hash.toLowerCase() : null;
      if (!hash) throw new HttpError(400, 'bad_param', 'Send {"key":"moon_..."} or {"key_hash":"<64 hex>"}');
      const rec = await env.KEYS_WRITE.read(hash);
      if (!rec) throw new HttpError(404, 'unknown_key', 'No key with that hash in the key store. Keys set in MOON_API_KEYS are changed in Vercel instead.');
      await env.KEYS_WRITE.set(hash, { ...rec, active: on });
      return json({ key_hash: hash, owner: rec.owner, plan: rec.plan, active: on }, 200, noStore);
    }
    return notFound();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status, noStore);
    return json({ error: { code: 'internal', message: 'Something went wrong' } }, 500, noStore);
  }
}

async function readJson(req: Request, max = 16_384): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'too_large', 'Send only the SHA-256 fingerprint or the receipt, not the content');
  try { const v = JSON.parse(text); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* fall through */ }
  throw new HttpError(400, 'bad_json', 'Body must be a JSON object');
}


// ---------- Receipt checks and evidence ----------
function knownKeys(env: Env): Record<string, string> {
  const keys: Record<string, string> = { ...(env.RETIRED_KEYS ?? {}) };
  if (env.SIGNER) { const i = env.SIGNER.info(); keys[i.key_id] = i.public_key; if (env.SIGNER.pq) { const q = env.SIGNER.pq.info(); keys[q.key_id] = q.public_key; } }
  return keys;
}

/** Everything /v1/verify reports about a receipt. */
function checkReceipt(r: Receipt, sha256: unknown, env: Env) {
  let out = verifyReceipt(r, knownKeys(env), env.BEACON_CHAIN);
  if (out.valid) {
    // The signed moonmark must be the same moment as the signed unix_ns.
    let same = false;
    try { same = formatMoonmark(toMoon(BigInt(r.unix_ns))) === r.moonmark; } catch { same = false; }
    if (!same) out = { valid: false, reason: 'moonmark_mismatch' };
  }
  if (out.valid && sha256 !== undefined) {
    const want = typeof sha256 === 'string' ? sha256.toLowerCase() : '';
    if (want !== r.sha256) out = { valid: false, reason: 'content_mismatch' };
  }
  const { not_before_unix_ns, beacon_round, post_quantum, ...rest } = out;
  return { ...rest, ...(out.valid ? { moonmark: r.moonmark, utc: unixNsToIso(BigInt(r.unix_ns)), key_id: r.key_id, ...(post_quantum !== undefined ? { signatures: post_quantum ? ['Ed25519', PQ_ALG] : ['Ed25519'], post_quantum } : { signatures: ['Ed25519'] }), ...(not_before_unix_ns ? { not_before: { utc: unixNsToIso(BigInt(not_before_unix_ns)), unix_ns: not_before_unix_ns, beacon: BEACON_NETWORK, round: beacon_round } } : {}) } : {}) };
}

/** JSON with keys sorted at every level, so the signed bytes are the same everywhere. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson((v as Record<string, unknown>)[k])).join(',') + '}';
}
export const EVIDENCE = 'moon-evidence/1';
/** The bytes Moon signs for an evidence statement: the version line, then the statement as canonical JSON. */
export const evidenceBytes = (statement: unknown) => new Uint8Array(Buffer.from(EVIDENCE + '\n' + canonicalJson(statement), 'utf8'));

/**
 * An evidence statement: Moon checks a receipt now (signatures, beacon, file fingerprint, its place in
 * the Tideline and the anchors) and signs what it found with its keys. Together with the receipt and
 * the proofs it is a self-contained record anyone can check without Moon.
 */
async function evidence(r: Receipt, sha256: unknown, env: Env) {
  const check = checkReceipt(r, sha256, env) as Record<string, unknown>;
  const now = nowUnixNs();
  let tideline: Record<string, unknown> = { status: 'not_configured' };
  let proof: unknown = null;
  if (env.TIDES && check.valid) {
    try {
      const p = await proofFor(env.TIDES, r) as Record<string, any>;
      proof = p;
      if (p.status === 'sealed') {
        const t = p.tide;
        tideline = { status: 'sealed', lune: t.lune, index: p.index, size: p.size, root: t.root, tide_hash: t.hash, prev: t.prev,
          xrpl: t.anchor ? { tx: t.anchor.tx, ledger_index: t.anchor.ledger_index ?? null } : null,
          bitcoin: t.bitcoin ? { status: t.bitcoin.status, block_height: t.bitcoin.block_height ?? null } : null,
          downloads: { tide_txt: `/v1/tideline/${t.lune}.txt`, tide_ots: t.bitcoin ? `/v1/tideline/${t.lune}.ots` : null } };
      } else if (p.status === 'checkpointed') {
        const c = p.checkpoint;
        tideline = { status: 'checkpointed', lune: p.lune, index: p.index, size: p.size, root: c.root, checkpoint_hash: c.hash, checkpoint_utc: unixNsToIso(BigInt(c.at_unix_ns)),
          xrpl: c.anchor ? { tx: c.anchor.tx, ledger_index: c.anchor.ledger_index ?? null } : null, seals_after_utc: p.seals_after_utc };
      } else tideline = { status: p.status, lune: p.lune, ...(p.index !== undefined ? { index: p.index } : {}), ...(p.seals_after_utc ? { seals_after_utc: p.seals_after_utc } : {}) };
    } catch { tideline = { status: 'unavailable' }; }
  }
  const statement = {
    evidence: EVIDENCE,
    issued: { utc: unixNsToIso(now), unix_ns: now.toString(), moonmark: formatMoonmark(toMoon(now)) },
    issuer: { name: 'Moon', url: 'https://moon369.org', keys: '/v1/keys' },
    receipt: { version: r.receipt, sha256: r.sha256, moonmark: r.moonmark, unix_ns: r.unix_ns, key_id: r.key_id, receipt_sha256: createHash('sha256').update(canonicalJson(r)).digest('hex') },
    checks: { valid: !!check.valid, ...(check.reason ? { reason: check.reason } : {}), signatures: check.signatures ?? [], post_quantum: check.post_quantum ?? null,
      content_match: sha256 === undefined ? null : !!check.valid, not_before: check.not_before ?? null },
    tideline,
  };
  const signature = env.SIGNER!.signBytes(evidenceBytes(statement));
  return { statement, signature, signed_bytes: `${EVIDENCE} + newline + canonical JSON of statement (keys sorted)`, receipt: r, proof };
}

/** Signs a SHA-256 fingerprint now: receipt, Tideline record, and links. Shared by /v1/sign and the TSA. */
interface Who { registrant: string; registrant_verified?: boolean; on_behalf_of?: string | null; label?: string | null; phash?: string | null }
async function latestBeacon(env: Env): Promise<Beacon | null> {
  if (!env.BEACON) return null;
  try { return await env.BEACON(nowUnixNs()); } catch { return null; }
}
async function signNow(env: Env, sha: string, at?: bigint, who: Who = { registrant: 'anonymous', registrant_verified: false }, beaconIn?: Beacon | null) {
  const S = env.SIGNER!;
  const beacon = beaconIn !== undefined ? beaconIn : await latestBeacon(env);
  const ns = at ?? nowUnixNs();
  const mark = formatMoonmark(toMoon(ns));
  const receipt = S.sign(sha, mark, ns, beacon);
  let tideline: Record<string, unknown> | null = null;
  if (env.TIDES) { try { tideline = { ...(await record(env.TIDES, receipt)), status: 'pending', seals_after_utc: unixNsToIso(luneEndNs(luneOf(ns))) }; } catch { tideline = null; } }
  if (tideline && env.TIDES && env.ANCHOR && env.DEFER) {
    const T = env.TIDES, A = env.ANCHOR;
    env.DEFER(checkpointSoon(T, S, nowUnixNs, A).catch(() => null));   // locks recent receipts on the XRP Ledger about once a minute
    tideline.checkpoint = 'within about a minute';
  }
  const signed_url = MARK_BASE + moonmarkPath(mark) + `?s=${receipt.sha256}&u=${receipt.unix_ns}&k=${receipt.key_id}` + (receipt.beacon ? `&r=${receipt.beacon.round}&b=${receipt.beacon.signature}` : '') + (receipt.pq ? `&q=${receipt.pq.key_id}` : '') + `&g=${receipt.signature}`;
  let registration: Record<string, unknown> | null = null;
  if (env.REGISTRY) {
    try {
      const reg = makeRegistration(receipt, signed_url, who, (b) => { const x = S.signBytes(b); return { key_id: x.key_id, signature: x.signature }; });
      await env.REGISTRY.add(reg);
      if (tideline && typeof tideline.leaf === 'string' && env.REGISTRY.addLeaf) await env.REGISTRY.addLeaf(tideline.leaf, sha).catch(() => null);
      registration = { registrant: reg.registrant, registrant_verified: reg.registrant_verified, on_behalf_of: reg.on_behalf_of, label: reg.label, phash: reg.phash, lookup: '/v1/lookup/' + sha };
    } catch { registration = null; }
  }
  return {
    receipt,
    tideline,
    registration,
    moonmark_url: MARK_BASE + moonmarkPath(mark),
    signed_url,
    utc: unixNsToIso(ns),
    accuracy_ns: Number(env.CLOCK_ACCURACY_NS ?? 1_000_000),
    clock: env.CLOCK_SOURCE ?? 'server-ntp',
  };
}

/** RFC 3161 time-stamping: DER in, DER out. */
async function tsaResponse(req: Request, env: Env, planHdr: Record<string, string>, who: Who = { registrant: 'anonymous', registrant_verified: false }): Promise<Response> {
  const hdr = { 'Content-Type': 'application/timestamp-reply', 'Cache-Control': 'no-store', ...CORS, ...planHdr };
  const reply = (der: Uint8Array, extra: Record<string, string> = {}) => new Response(Buffer.from(der), { status: 200, headers: { ...hdr, ...extra } });
  const ct = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (ct && ct !== 'application/timestamp-query' && ct !== 'application/octet-stream') return reply(tsaReject(TSA_FAIL.badRequest, 'Content-Type must be application/timestamp-query'));
  if (!env.TSA) return reply(tsaReject(TSA_FAIL.systemFailure, 'Time-stamping is not configured on this deployment'));
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length === 0 || body.length > 8192) return reply(tsaReject(TSA_FAIL.badDataFormat, 'Send one DER TimeStampReq'));
  let parsed;
  try { parsed = parseTsq(body); } catch (e) { return reply(tsaReject(e instanceof TsaReject ? e.fail : TSA_FAIL.badDataFormat, e instanceof Error ? e.message : 'Bad request')); }
  const ns = nowUnixNs();
  let moonmarkUrl: string | undefined, mark: string | undefined;
  if (parsed.hashName === 'SHA-256' && env.SIGNER) {
    try { const out = await signNow(env, Buffer.from(parsed.digest).toString('hex'), ns, who); moonmarkUrl = out.signed_url; mark = out.receipt.moonmark; } catch { moonmarkUrl = undefined; }
  }
  const serial = (ns << 16n) | BigInt(Math.floor(Math.random() * 65536));
  const der = issueTst(env.TSA, parsed, { unixNs: ns, serial, accuracyMs: Math.max(1, Math.round(Number(env.CLOCK_ACCURACY_NS ?? 1_000_000) / 1e6)), moonmarkUrl });
  return reply(der, mark ? { 'X-Moon-Moonmark': mark, ...(moonmarkUrl ? { 'X-Moon-Url': moonmarkUrl } : {}) } : {});
}

export async function handle(req: Request, env: Env = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;
  if (path === '/mcp') return mcp(req, env, handle);
  if (path === `/${API_VERSION}/tsa` && req.method === 'POST') {
    const gate = await authAndLimit(req, env, true);
    if (gate instanceof Response) return gate;
    return tsaResponse(req, env, { 'X-Moon-Plan': gate.plan }, registrantOf(gate));
  }
  const postOnly = path.startsWith(`/${API_VERSION}/admin/`) || path === `/${API_VERSION}/api-keys` || path === `/${API_VERSION}/sign` || path === `/${API_VERSION}/sign/batch` || path === `/${API_VERSION}/lookup/similar` || path === `/${API_VERSION}/verify` || path === `/${API_VERSION}/evidence` || path === `/${API_VERSION}/tideline/proof` || path === `/${API_VERSION}/editions` || path === `/${API_VERSION}/reseal` || path === `/${API_VERSION}/reseal/verify`;
  if (postOnly ? req.method !== 'POST' : (req.method !== 'GET' && req.method !== 'HEAD'))
    return json({ error: { code: 'method_not_allowed', message: postOnly ? 'Use POST with a JSON body' : 'Use GET' } }, 405, postOnly ? { Allow: 'POST, OPTIONS' } : {});

  if (path === '/' ) return json({ name: 'Moon API', version: API_VERSION, spec: SPEC_VERSION, docs: '/v1/spec', endpoints: ['/v1/now', '/v1/moonmark', '/v1/m/{moonmark}', '/v1/convert', '/v1/to-unix', '/v1/cycle/{cycle}', '/v1/spec', '/v1/card.svg', '/v1/card.png', '/v1/keys', '/v1/me', 'POST /v1/sign', 'POST /v1/verify', '/v1/tideline', '/v1/tideline/{lune}', 'POST /v1/tideline/proof', 'POST /v1/evidence', 'POST /v1/tsa (RFC 3161)', '/v1/tsa', 'POST /v1/sign/batch', '/v1/lookup/{sha256}', 'POST /v1/lookup/similar', '/v1/night', '/v1/night.png', '/v1/eclipses', '/v1/eclipses/next', '/v1/eclipses/{date}', '/v1/eclipses.csv', '/v1/eclipse.svg', '/v1/eclipse.png', 'POST /v1/api-keys', '/v1/search?q=', '/v1/registrants/{name}', '/v1/drift', '/v1/status', '/v1/event', '/v1/event.ics', 'POST /v1/reseal', 'POST /v1/reseal/verify', 'POST /v1/editions', '/v1/editions/{statement}/{print}', 'POST /mcp (Model Context Protocol)'] });
  if (path === '/health') return json({ ok: true });

  if (path.startsWith(`/${API_VERSION}/admin/`)) return adminRoute(req, env, path);

  const signing = req.method === 'POST' && (path === `/${API_VERSION}/sign` || path === `/${API_VERSION}/reseal` || path === `/${API_VERSION}/sign/batch` || path === `/${API_VERSION}/evidence`);
  const gate = await authAndLimit(req, env, signing);
  if (gate instanceof Response) return gate;
  const planHdr = { 'X-Moon-Plan': gate.plan };

  try {
    switch (true) {
      case path === `/${API_VERSION}/spec`:
        return json(SPEC, 200, { ...FOREVER, ...planHdr });

      case path === `/${API_VERSION}/now`: {
        const ns = nowUnixNs();
        return json(moonBody(toMoon(ns), ns), 200, { ...NOW_CACHE, ...planHdr });
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
        const ns = unixNsFromQuery(q);
        if (ns === null) throw new HttpError(400, 'missing_param', 'Provide unix (ms), unix_ns or utc');
        const t = toMoon(ns);
        if (q.get('format') === 'string') {
          return new Response(formatMoonmark(t), { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...FOREVER, ...planHdr } });
        }
        return json(moonBody(t, ns), 200, { ...FOREVER, ...planHdr });
      }

      case path === `/${API_VERSION}/card.svg`: {
        // The Today on Moon card as an image: <img src="https://api.moon369.org/v1/card.svg">
        const mark = q.get('moonmark');
        let ns = mark ? toUnixNs(parseMoonmark(mark)) : unixNsFromQuery(q);
        const fixed = ns !== null;
        if (ns === null) ns = nowUnixNs();
        const sizeRaw = q.get('size');
        const size = sizeRaw === null ? 600 : Number(sizeRaw);
        if (!Number.isInteger(size) || size < 120 || size > 2000) throw new HttpError(400, 'bad_param', 'size must be a whole number of pixels from 120 to 2000');
        const t = toMoon(ns), ph = truePhase(ns);
        const svg = cardSvg({ year: t.year, moon: t.moon, lune: t.day, lunesInMoon: moonLength(t.moon), fraction: ph, tilt: moonTilt(ns), illumination: illumination(ns), name: phaseName(ph), title: fixed ? 'MOONMARK' : undefined }, size);
        return new Response(req.method === 'HEAD' ? null : svg, { status: 200, headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src data:",
          'X-Content-Type-Options': 'nosniff',
          'Access-Control-Allow-Origin': '*',
          ...(fixed ? FOREVER : { 'Cache-Control': 'public, max-age=60' }),
          ...planHdr,
        } });
      }

      case path === `/${API_VERSION}/card.png`: {
        // A 1200x630 share image for one Moonmark, for link previews on X, iMessage and Slack.
        const mark = q.get('moonmark');
        let ns = mark ? toUnixNs(parseMoonmark(mark)) : unixNsFromQuery(q);
        const fixed = ns !== null;
        if (ns === null) ns = nowUnixNs();
        const t = toMoon(ns), ph = truePhase(ns);
        const p2 = (n: number) => String(n).padStart(2, '0');
        const svg = shareSvg({ year: t.year, moon: t.moon, lune: t.day, lunesInMoon: moonLength(t.moon), fraction: ph, tilt: moonTilt(ns), illumination: illumination(ns), name: phaseName(ph),
          time: `${p2(t.hour)}:${p2(t.minute)}:${p2(t.second)}`, ns: String(t.nanosecond).padStart(9, '0'), title: fixed ? 'MOONMARK' : 'TODAY ON MOON',
          event: (q.get('event') ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || undefined });
        const png = svgToPng(svg, 1200);
        return new Response(req.method === 'HEAD' ? null : new Uint8Array(png), { status: 200, headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*',
          ...(fixed ? FOREVER : { 'Cache-Control': 'public, max-age=60' }),
          ...planHdr,
        } });
      }

      case path === `/${API_VERSION}/night` || path === `/${API_VERSION}/night.png` || path === `/${API_VERSION}/night.svg`: {
        // Your Moon: the moon on any date, with a share card. ?d=1990-06-14&t=2130&z=-0700&for=born
        let n;
        try { n = parseNight(q); } catch (e) { if (e instanceof NightParamError) throw new HttpError(400, 'bad_param', e.message); throw e; }
        const facts = nightFacts(n, Date.now());
        const cache = { 'Cache-Control': 'public, max-age=86400, s-maxage=2592000' };   // the return year moves on, so not forever
        if (path.endsWith('/night')) return json({ ...facts, occasion: n.occasion, place: n.place ?? null }, 200, { ...cache, ...planHdr });
        const fmt = q.get('fmt') === 'story' ? 'story' : 'og';
        const svg = nightSvg(n, facts, fmt);
        if (path.endsWith('.svg')) return new Response(req.method === 'HEAD' ? null : svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*', ...cache, ...planHdr } });
        const png = svgToPng(svg, fmt === 'story' ? 1080 : 1200);
        return new Response(req.method === 'HEAD' ? null : new Uint8Array(png), { status: 200, headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', ...cache, ...planHdr } });
      }

      case path === `/${API_VERSION}/eclipse.svg`: {
        const t = (q.get('type') ?? 'total') as EclipseType;
        if (!ECLIPSE_TYPES.includes(t)) throw new HttpError(400, 'bad_param', 'type must be total, annular, hybrid or partial');
        const size = q.get('size') === null ? 64 : Number(q.get('size'));
        if (!Number.isInteger(size) || size < 12 || size > 1024) throw new HttpError(400, 'bad_param', 'size must be a whole number of pixels from 12 to 1024');
        return new Response(req.method === 'HEAD' ? null : eclipseIcon(t, size, q.get('bg') !== '0'), { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*', ...FOREVER, ...planHdr } });
      }

      case path === `/${API_VERSION}/eclipse.png`: {
        const e = eclipseByDate(q.get('date') ?? '');
        if (!e) throw new HttpError(404, 'not_found', 'No solar eclipse on that date. Dates are YYYY-MM-DD by Terrestrial Time, as NASA lists them.');
        return new Response(req.method === 'HEAD' ? null : new Uint8Array(svgToPng(eclipseCardSvg(e), 1200)), { status: 200, headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', ...FOREVER, ...planHdr } });
      }

      case path === `/${API_VERSION}/eclipses` || path === `/${API_VERSION}/eclipses.csv`: {
        // Every solar eclipse, -1999 to 3000. ?from=YEAR&to=YEAR&type=total,hybrid&limit=500&cursor=N
        const all = allEclipses();
        const types = (q.get('type') ?? '').split(',').map((x) => x.trim()).filter(Boolean) as EclipseType[];
        for (const t of types) if (!ECLIPSE_TYPES.includes(t)) throw new HttpError(400, 'bad_param', 'type must be total, annular, hybrid or partial (comma-separated)');
        const yr = (k: string, d: number) => { const v = q.get(k); if (v === null) return d; const n = Number(v); if (!Number.isInteger(n)) throw new HttpError(400, 'bad_param', `${k} must be a year like 2024 or -500`); return n; };
        const csv = path.endsWith('.csv');
        const thisYear = new Date().getUTCFullYear();
        const from = yr('from', csv ? -1999 : thisYear), to = yr('to', csv ? 3000 : from + 19);
        const pick = all.filter((e) => e.y >= from && e.y <= to && (!types.length || types.includes(e.type)));
        if (csv) {
          const head = 'date,calendar,greatest_eclipse_td,utc,type,central,gamma,magnitude,saros,delta_t_s,moonmark';
          const rows = pick.map((e) => { const p = publicEclipse(e); return [p.date, p.calendar, p.greatest_eclipse_td, p.utc, p.type, p.central, p.gamma, p.magnitude ?? '', p.saros, p.delta_t_s, p.moonmark].join(','); });
          return new Response(req.method === 'HEAD' ? null : head + '\n' + rows.join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'inline; filename="moon-solar-eclipses.csv"', ...CORS, 'Cache-Control': 'public, max-age=86400', ...planHdr } });
        }
        const limit = q.get('limit') === null ? 500 : Number(q.get('limit'));
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new HttpError(400, 'bad_param', 'limit must be 1 to 1000');
        const cursor = q.get('cursor') === null ? 0 : Number(q.get('cursor'));
        if (!Number.isInteger(cursor) || cursor < 0) throw new HttpError(400, 'bad_param', 'cursor must be a whole number');
        const page = pick.slice(cursor, cursor + limit).map(publicEclipse);
        const more = cursor + limit < pick.length;
        return json({ from, to, types: types.length ? types : ECLIPSE_TYPES, count: pick.length, returned: page.length, next_cursor: more ? cursor + limit : null,
          source: 'Computed by Moon (Meeus ch. 54, Espenak-Meeus Delta T). Dates and times are Terrestrial Time, as in NASA\'s Five Millennium Canon.', eclipses: page },
          200, { 'Cache-Control': 'public, max-age=86400', ...planHdr });
      }

      case path === `/${API_VERSION}/eclipses/next`: {
        const types = (q.get('type') ?? '').split(',').filter(Boolean) as EclipseType[];
        for (const t of types) if (!ECLIPSE_TYPES.includes(t)) throw new HttpError(400, 'bad_param', 'type must be total, annular, hybrid or partial');
        const after = q.get('after') === null ? Date.now() : Number(q.get('after'));
        if (!Number.isFinite(after)) throw new HttpError(400, 'bad_param', 'after must be Unix milliseconds');
        const all = allEclipses();
        let i = indexAfter(after);
        while (i < all.length && types.length && !types.includes(all[i].type)) i++;
        if (i >= all.length) throw new HttpError(404, 'not_found', 'No eclipse after that moment before the year 3000');
        const e = all[i];
        return json({ ...publicEclipse(e), in_days: Math.round(((e.ms - after) / 86400000) * 10) / 10 }, 200, { 'Cache-Control': 'public, max-age=3600', ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/eclipses/`): {
        const date = decodeURIComponent(path.slice(`/${API_VERSION}/eclipses/`.length));
        const e = eclipseByDate(date);
        if (!e) throw new HttpError(404, 'not_found', 'No solar eclipse on that date. Use YYYY-MM-DD (or -YYYY-MM-DD before year 1) by Terrestrial Time.');
        const all = allEclipses(), i = all.indexOf(e);
        const sameSaros = all.filter((x) => x.saros === e.saros);
        const j = sameSaros.indexOf(e);
        const brief = (x: typeof e | undefined) => (x ? { date: ymdOf(x), type: x.type, page: `https://moon369.org/eclipse/${ymdOf(x)}` } : null);
        return json({ ...publicEclipse(e), previous: brief(all[i - 1]), next: brief(all[i + 1]),
          saros_series: { saros: e.saros, member: j + 1, of: sameSaros.length, previous: brief(sameSaros[j - 1]), next: brief(sameSaros[j + 1]) } },
          200, { ...FOREVER, ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/m/`): {
        // Resolve a Moonmark link (what a Moonmark QR code points to).
        const raw = decodeURIComponent(path.slice(`/${API_VERSION}/m/`.length));
        const ns = toUnixNs(parseMoonmark(raw));
        const evName = cleanEventName(q.get('event'));
        return json({ ...moonBody(toMoon(ns), ns), ...(evName ? { event: eventLinks(evName, ns) } : {}) }, 200, { ...FOREVER, ...planHdr });
      }

      case path === `/${API_VERSION}/event` || path === `/${API_VERSION}/event.ics`: {
        // An event link: a name and one moment that opens in everyone's own local time.
        //   /v1/event?name=Launch&utc=2026-12-04T19:00:00-07:00   (or moonmark=..., unix=..., unix_ns=...)
        const name = cleanEventName(q.get('name'));
        if (!name) throw new HttpError(400, 'bad_param', 'name: what the event is called, up to 80 characters');
        const mark = q.get('moonmark');
        const ns = mark ? toUnixNs(parseMoonmark(mark)) : unixNsFromQuery(q);
        if (ns === null) throw new HttpError(400, 'bad_param', 'Give the moment as utc (ISO 8601 with Z or an offset), moonmark, unix (ms) or unix_ns');
        const minutes = q.get('minutes') === null ? 60 : Number(q.get('minutes'));
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) throw new HttpError(400, 'bad_param', 'minutes: how long the event lasts, 1 to 10080');
        if (path.endsWith('.ics')) {
          return new Response(req.method === 'HEAD' ? null : eventIcs(name, ns, minutes), { status: 200, headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `attachment; filename="${(name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event')}.ics"`,
            'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600', ...planHdr } });
        }
        return json(eventLinks(name, ns, minutes), 200, { 'Cache-Control': 'public, max-age=3600', ...planHdr });
      }

      case path === `/${API_VERSION}/to-unix`: {
        const input = moonInputFromQuery(q);
        const ns = toUnixNs(input);
        const { year: _y, cycle: _c, ...restIn } = input as { year?: number; cycle?: number };
        return json({ input: { cycle: _c ?? _y, ...restIn }, unix_ns: ns, unix_ms: Number(ns / 1_000_000n), utc: unixNsToIso(ns) }, 200, { ...FOREVER, ...planHdr });
      }

      case path === `/${API_VERSION}/me`:
        return json({ plan: gate.plan, ...(gate.owner ? { owner: gate.owner, owner_verified: gate.verified === true } : {}), per_min: gate.per_min ?? null, keyed: gate.plan !== 'open' }, 200, { 'Cache-Control': 'no-store', ...planHdr });

      case path === `/${API_VERSION}/keys`: {
        const keys = [
          ...(env.SIGNER ? [env.SIGNER.info()] : []),
          ...(env.SIGNER?.pq ? [env.SIGNER.pq.info()] : []),
          ...Object.entries(env.RETIRED_KEYS ?? {}).map(([key_id, public_key]) => ({ key_id, alg: Buffer.from(public_key, 'base64url').length === 32 ? 'Ed25519' : PQ_ALG, public_key, status: 'retired' })),
        ];
        return json({ receipt: env.SIGNER?.pq ? RECEIPT_V3 : env.BEACON ? RECEIPT_V2 : RECEIPT_V1, receipts_accepted: RECEIPT_VERSIONS, keys, signing: env.SIGNER ? (env.SIGNER.pq ? 'hybrid' : 'enabled') : 'not_configured' }, 200, { 'Cache-Control': 'public, max-age=300', ...planHdr });
      }

      case path === `/${API_VERSION}/api-keys`: {
        // A free API key, straight away. Shown once; only its SHA-256 is stored.
        if (!env.KEYS_WRITE) throw new HttpError(503, 'keys_unavailable', 'Self-serve keys are not switched on yet. Email moon369org@proton.me for a key.');
        const body = await readJson(req);
        const name = cleanText(body.name, 80), email = cleanText(body.email, 200), use = cleanText(body.use, 300);
        if (!name || name.length < 2) throw new HttpError(400, 'bad_param', 'name: who the key is for (your name, app or company), 2 to 80 characters');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'bad_param', 'email: a working address, so we can reach you about your key');
        const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anonymous';
        if (env.KEY_CREATE_LIMIT && !(await env.KEY_CREATE_LIMIT.limit({ key: ip })).success)
          throw new HttpError(429, 'rate_limited', 'Too many new keys from here today. Try again tomorrow, or email moon369org@proton.me.');
        const L = env.FREE_LIMITS ?? { per_min: 60, sign_per_day: 500 };
        const key = newKey();
        const ok = await env.KEYS_WRITE.put(hashKey(key), { owner: name, plan: 'free', per_min: L.per_min, verified: false, email, use: use ?? undefined, created: new Date().toISOString() });
        if (!ok) throw new HttpError(500, 'key_failed', 'Could not create a key. Try again.');
        return json({ key, owner: name, owner_verified: false, plan: 'free', per_min: L.per_min, requests_per_day: L.req_per_day ?? 5000, signing_per_day: L.sign_per_day,
          note: 'Keep this key secret: it is shown once and cannot be recovered. Send it as Authorization: Bearer <key>. Registrations made with it show your name as unverified; for a verified name, email moon369org@proton.me.' },
          201, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/sign`: {
        if (!env.SIGNER) throw new HttpError(503, 'signing_unavailable', 'Signing is not configured on this deployment');
        const body = await readJson(req);
        const sha = typeof body.sha256 === 'string' ? body.sha256.toLowerCase() : body.sha256;
        if (!isSha256Hex(sha)) throw new HttpError(400, 'bad_param', 'sha256 must be the 64-character hex SHA-256 of your content. Send the fingerprint, never the content.');
        return json(await signNow(env, sha, undefined, whoFrom(body, gate)), 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/sign/batch`: {
        if (!env.SIGNER) throw new HttpError(503, 'signing_unavailable', 'Signing is not configured on this deployment');
        if (gate.plan === 'open') throw new HttpError(403, 'key_required', 'Batch signing needs an API key. Email moon369org@proton.me.');
        const body = await readJson(req, 262_144);
        const items = Array.isArray(body.items) ? body.items as Record<string, unknown>[] : null;
        if (!items || items.length === 0 || items.length > 100) throw new HttpError(400, 'bad_param', 'items must be a list of 1 to 100 objects like {"sha256": "<hex>"}');
        for (const [i, it] of items.entries()) {
          const sh = typeof it?.sha256 === 'string' ? it.sha256.toLowerCase() : it?.sha256;
          if (!isSha256Hex(sh)) throw new HttpError(400, 'bad_param', `items[${i}].sha256 must be a 64-character hex SHA-256`);
        }
        const beacon = await latestBeacon(env);   // one beacon for the whole batch
        const results = [];
        for (const it of items) results.push(await signNow(env, String(it.sha256).toLowerCase(), undefined, whoFrom(it, gate), beacon));
        return json({ count: results.length, results }, 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/lookup/`) && path !== `/${API_VERSION}/lookup/similar`: {
        if (!env.REGISTRY) throw new HttpError(503, 'registry_unavailable', 'Lookups are not configured on this deployment');
        const sh = path.split('/').pop()!.toLowerCase();
        if (!isSha256Hex(sh)) throw new HttpError(400, 'bad_param', 'Put the 64-character hex SHA-256 of the file in the path');
        const regs = await env.REGISTRY.bySha(sh, 50);
        regs.sort((a, b) => (BigInt(a.unix_ns) < BigInt(b.unix_ns) ? -1 : 1));
        const pub = regs.map(publicRegistration);
        return json({ sha256: sh, registered: pub.length > 0, count: pub.length, first: pub[0] ?? null, registrations: pub }, 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/lookup/similar`: {
        if (!env.REGISTRY) throw new HttpError(503, 'registry_unavailable', 'Lookups are not configured on this deployment');
        const body = await readJson(req);
        const ph = typeof body.phash === 'string' ? body.phash.toLowerCase() : body.phash;
        if (!isPhash(ph)) throw new HttpError(400, 'bad_param', 'phash must be a 64-bit look-alike hash: 16 hex for an image, or "v:" / "a:" + 16 hex for video or audio');
        const cands = new Set<string>();
        for (const b of bands(ph)) for (const c of await env.REGISTRY.candidatesByBand(b)) { cands.add(c); if (cands.size >= 200) break; }
        const matches = [];
        for (const c of cands) {
          const regs = await env.REGISTRY.bySha(c, 50);
          const withPh = regs.filter((r) => r.phash);
          if (!withPh.length) continue;
          withPh.sort((a, b) => (BigInt(a.unix_ns) < BigInt(b.unix_ns) ? -1 : 1));
          const d = hamming(ph, withPh[0].phash!);
          if (d <= SIMILAR_BITS) matches.push({ sha256: c, distance: d, first: publicRegistration(withPh[0]) });
        }
        matches.sort((a, b) => a.distance - b.distance || (BigInt(a.first.statement.unix_ns) < BigInt(b.first.statement.unix_ns) ? -1 : 1));
        return json({ phash: ph, threshold_bits: SIMILAR_BITS, count: matches.length, matches: matches.slice(0, 20), kind: phashKind(ph), note: 'Look-alikes: a match means the picture, video or sound is very close, not that it is the same file. The earliest registration is usually the original.' }, 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/tsa`:
        return json({
          tsa: 'RFC 3161',
          url: 'https://api.moon369.org/v1/tsa',
          status: env.TSA ? 'enabled' : 'not_configured',
          request: 'POST a DER TimeStampReq with Content-Type: application/timestamp-query',
          hashes: ['SHA-256', 'SHA-384', 'SHA-512'],
          policy: TSA_POLICY,
          signature: 'ECDSA P-256 with SHA-256',
          certificates: '/v1/tsa/certs.pem',
          moon: 'For SHA-256 requests Moon also signs a Moonmark (Ed25519 + ML-DSA-65) for the same moment, logs it on the Tideline, and puts its link in the token (extension ' + TSA_EXT_MOONMARK + ') and the X-Moon-Url header.',
          example: 'openssl ts -query -data file -sha256 -cert -out req.tsq && curl -s -H "Content-Type: application/timestamp-query" --data-binary @req.tsq https://api.moon369.org/v1/tsa -o resp.tsr',
        }, 200, { 'Cache-Control': 'public, max-age=300', ...planHdr });

      case path === `/${API_VERSION}/tsa/certs.pem`:
        if (!env.TSA) throw new HttpError(503, 'tsa_unavailable', 'Time-stamping is not configured on this deployment');
        return new Response(env.TSA.pem() + MOON_ROOT_PEM, { headers: { 'Content-Type': 'application/x-pem-file', 'Content-Disposition': 'inline; filename="moon-tsa.pem"', 'Cache-Control': 'public, max-age=86400', ...CORS, ...planHdr } });

      case path === `/${API_VERSION}/verify`: {
        const body = await readJson(req);
        // Accept the receipt itself, or { receipt: {...} }. A bare receipt has its own "receipt" field: the version string.
        const r = (body.receipt && typeof body.receipt === 'object' ? body.receipt : body) as Receipt;
        return json(checkReceipt(r, body.sha256, env), 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/editions`: {
        // Register an edition: every print gets its own ID. Send the signed moon-coa/1 statement and its receipt.
        if (!env.EDITIONS) throw new HttpError(503, 'editions_unavailable', 'The edition registry is not configured on this deployment');
        const body = await readJson(req, 32_768);
        const text = typeof body.statement === 'string' ? body.statement : '';
        const st = parseStatement(text);
        if (!st) throw new HttpError(400, 'bad_param', 'statement: a moon-coa/1 certificate statement');
        if (st.edition === null) throw new HttpError(400, 'bad_param', 'A unique work has no prints to number');
        const sha = statementSha(text);
        const rc = (body.receipt && typeof body.receipt === 'object' ? body.receipt : null) as Receipt | null;
        if (!rc) throw new HttpError(400, 'bad_param', 'receipt: the receipt Moon gave when it signed the statement');
        const chk = checkReceipt(rc, sha, env) as { valid: boolean; reason?: string };
        if (!chk.valid) throw new HttpError(400, 'bad_receipt', 'The receipt does not cover this statement' + (chk.reason ? ` (${chk.reason})` : ''));
        const ed = await env.EDITIONS.put(sha, { n: st.edition, ids: newPrintIds(st.edition), created: new Date().toISOString(), moonmark: rc.moonmark });
        return json({ statement_sha256: sha, edition: ed.n, registered: ed.created, prints: ed.ids.map((id, i) => ({ print: i + 1, id })) }, 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/editions/`): {
        // Check one print: /v1/editions/<statement sha256>/<print>?id=<print id>
        if (!env.EDITIONS) throw new HttpError(503, 'editions_unavailable', 'The edition registry is not configured on this deployment');
        const [, , , sha, pn] = path.split('/');
        const print = Number(pn), id = q.get('id') ?? '';
        if (!isSha256Hex(sha ?? '') || !Number.isInteger(print) || print < 1) throw new HttpError(400, 'bad_param', 'Use /v1/editions/<statement sha256>/<print number>?id=<print id>');
        const ed = await env.EDITIONS.get(sha.toLowerCase());
        if (!ed) return json({ registered: false, valid: false, reason: 'This edition is not registered on Moon' }, 200, { 'Cache-Control': 'no-store', ...planHdr });
        if (print > ed.n || ed.ids[print - 1] !== id)
          return json({ registered: true, valid: false, edition: ed.n, reason: print > ed.n ? `This edition has ${ed.n} prints` : 'This print ID does not belong to this print' }, 200, { 'Cache-Control': 'no-store', ...planHdr });
        const h = await env.EDITIONS.hit(sha.toLowerCase(), print, new Date().toISOString());
        return json({ registered: true, valid: true, print, edition: ed.n, registered_at: ed.created, checks: h.count, first_check: h.first }, 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/reseal`: {
        // Re-seal an old receipt: Moon signs its fingerprint now, with today's algorithms.
        if (!env.SIGNER) throw new HttpError(503, 'signing_unavailable', 'Signing is not configured on this deployment');
        const body = await readJson(req, 65_536);
        const old = (body.receipt && typeof body.receipt === 'object' ? body.receipt : null) as Receipt | null;
        if (!old) throw new HttpError(400, 'bad_param', 'receipt: the old receipt to re-seal, as JSON');
        const before = checkReceipt(old, undefined, env) as { valid: boolean; reason?: string };
        if (!before.valid) throw new HttpError(400, 'bad_receipt', 'Moon re-seals only receipts that still check out' + (before.reason ? ` (${before.reason})` : ''));
        const fp = resealFingerprint(old);
        const out = await signNow(env, fp, undefined, whoFrom(body, gate));
        return json({ reseal: RESEAL, fingerprint: fp, of: old, ...out,
          how: 'fingerprint = SHA-256 of "moonmark-reseal/1\n" + the old receipt as JSON with keys sorted at every level. Check with POST /v1/reseal/verify {"receipt": <new>, "of": <old>}.' },
          200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/reseal/verify`: {
        const body = await readJson(req, 131_072);
        const rc = body.receipt as Receipt, old = body.of;
        if (!rc || typeof rc !== 'object' || !old || typeof old !== 'object') throw new HttpError(400, 'bad_param', 'Send {"receipt": <the re-seal receipt>, "of": <the old receipt>}');
        const fp = resealFingerprint(old);
        const now = checkReceipt(rc, fp, env) as { valid: boolean; moonmark?: string; reason?: string };
        const then = checkReceipt(old as Receipt, undefined, env) as { valid: boolean; moonmark?: string; reason?: string };
        return json({ valid: now.valid, fingerprint: fp, resealed_at: now.moonmark ?? null, reseal: now, original: { moonmark: (old as Receipt).moonmark, still_valid: then.valid, ...(then.valid ? {} : { reason: then.reason }) },
          meaning: now.valid ? 'The old receipt, exactly as given, existed when Moon re-sealed it. That holds even if the old receipt\'s own algorithms are broken later.' : 'The re-seal does not cover this receipt.' },
          200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/evidence`: {
        if (!env.SIGNER) throw new HttpError(503, 'signing_unavailable', 'Signing is not configured on this deployment');
        const body = await readJson(req);
        const r = (body.receipt && typeof body.receipt === 'object' ? body.receipt : body) as Receipt;
        return json(await evidence(r, body.sha256, env), 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/tideline/seal`: {
        if (!env.CRON_SECRET || req.headers.get('Authorization') !== `Bearer ${env.CRON_SECRET}`) throw new HttpError(403, 'forbidden', 'Sealing runs on Moon\'s schedule');
        if (!env.TIDES || !env.SIGNER) throw new HttpError(503, 'tideline_unavailable', 'The Tideline is not configured on this deployment');
        const sealed = await sealDue(env.TIDES, env.SIGNER, nowUnixNs(), env.ANCHOR, 40, env.BITCOIN);
        const confirmed = env.BITCOIN ? await upgradeBitcoin(env.TIDES, env.BITCOIN) : [];
        return json({ sealed: sealed.map((t) => ({ lune: t.lune, size: t.size, hash: t.hash, anchored: !!t.anchor, bitcoin: t.bitcoin?.status ?? null })), bitcoin_confirmed: confirmed }, 200, { 'Cache-Control': 'no-store' });
      }

      case path === `/${API_VERSION}/tideline/proof`: {
        if (!env.TIDES) throw new HttpError(503, 'tideline_unavailable', 'The Tideline is not configured on this deployment');
        const body = await readJson(req);
        const r = (body.receipt && typeof body.receipt === 'object' ? body.receipt : body) as Receipt;
        if (!r || typeof r !== 'object' || typeof (r as Receipt).unix_ns !== 'string' || !/^-?\d+$/.test((r as Receipt).unix_ns)) throw new HttpError(400, 'bad_param', 'Send a signed Moonmark receipt');
        return json(await proofFor(env.TIDES, r), 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/search`: {
        if (!env.REGISTRY) throw new HttpError(503, 'registry_unavailable', 'Search is not configured on this deployment');
        const term = (q.get('q') ?? '').trim();
        if (!term || term.length > 120) throw new HttpError(400, 'bad_param', 'Search for a SHA-256, a Moonmark (1928.05.06 10:43:17), a lune (1928.05.06), a UTC date, or a verified name');
        const limit = Math.min(500, Math.max(1, Number(q.get('limit') ?? 200) || 200));
        const hdr = { 'Cache-Control': 'public, max-age=30', ...planHdr };
        if (isSha256Hex(term.toLowerCase())) {
          const h = term.toLowerCase(), byTime = (a: Registration, b: Registration) => (BigInt(a.unix_ns) < BigInt(b.unix_ns) ? -1 : 1);
          const regs = (await env.REGISTRY.bySha(h, 50)).sort(byTime);
          if (regs.length) return json({ kind: 'file', q: term, count: regs.length, results: regs.map((r) => ({ ...publicRegistration(r), sha256: r.sha256 })) }, 200, hdr);
          // Not a file: maybe a Tideline entry, the receipt's fingerprint in the log.
          const fileSha = env.REGISTRY.shaByLeaf ? await env.REGISTRY.shaByLeaf(h) : null;
          if (fileSha) {
            const hit = (await env.REGISTRY.bySha(fileSha, 50)).sort(byTime);
            return json({ kind: 'entry', q: term, count: hit.length, results: hit.slice(0, 1).map(searchView) }, 200, hdr);
          }
          return json({ kind: 'file', q: term, count: 0, results: [] }, 200, hdr);
        }
        let w: ReturnType<typeof searchWindow> = null;
        try { w = searchWindow(term); } catch { w = null; }
        if (w) {
          if (!env.REGISTRY.byTime) throw new HttpError(503, 'search_unavailable', 'Search by time is not available here');
          const regs = await env.REGISTRY.byTime(w.from, w.to, limit);
          return json({ kind: 'time', q: term, window: { from_utc: new Date(w.from).toISOString(), to_utc: new Date(w.to).toISOString(), span: w.label }, count: regs.length,
            note: 'Registrations under a verified name are shown in full; for everyone else, only the moment is shown.', results: regs.map(searchView), ...(regs.length === limit ? { truncated: true } : {}) }, 200, hdr);
        }
        const slug = registrantSlug(term);
        if (!slug || !env.REGISTRY.byRegistrant) return json({ kind: 'none', q: term, count: 0, results: [] }, 200, hdr);
        const regs = await env.REGISTRY.byRegistrant(slug, limit);
        if (!regs.length && env.REGISTRY.byLabel && term.length >= 2) {
          // Not a verified name: look through what verified names have registered (labels like file names).
          const hits = await env.REGISTRY.byLabel(term, limit);
          return json({ kind: 'label', q: term, count: hits.length, results: hits.map((r) => ({ ...publicRegistration(r), sha256: r.sha256 })) }, 200, hdr);
        }
        return json({ kind: 'registrant', q: term, slug, registrant: regs[0]?.registrant ?? null, count: regs.length, page: `https://moon369.org/by/${slug}`,
          results: regs.map((r) => ({ ...publicRegistration(r), sha256: r.sha256 })) }, 200, hdr);
      }

      case path.startsWith(`/${API_VERSION}/registrants/`): {
        if (!env.REGISTRY?.byRegistrant) throw new HttpError(503, 'registry_unavailable', 'Registrant pages are not configured on this deployment');
        const slug = registrantSlug(decodeURIComponent(path.split('/').pop() ?? ''));
        if (!slug) throw new HttpError(400, 'bad_param', 'Put a registrant name in the path, like /v1/registrants/moon');
        const limit = Math.min(500, Math.max(1, Number(q.get('limit') ?? 200) || 200));
        const before = q.get('before') ? Number(q.get('before')) : undefined;
        if (before !== undefined && !Number.isFinite(before)) throw new HttpError(400, 'bad_param', 'before is a Unix time in ms');
        const regs = await env.REGISTRY.byRegistrant(slug, limit, before);
        const last = regs.at(-1);
        return json({ slug, registrant: regs[0]?.registrant ?? null, verified: regs.length > 0, count: regs.length,
          results: regs.map((r) => ({ ...publicRegistration(r), sha256: r.sha256 })),
          ...(regs.length === limit && last ? { next_before: Number(BigInt(last.unix_ns) / 1_000_000n) } : {}) }, 200, { 'Cache-Control': 'public, max-age=60', ...planHdr });
      }

      case path === `/${API_VERSION}/drift`: {
        // How closely Moon's lunations track the real Moon: the gap at every new moon, and its average by century.
        const from = Math.max(-2000, Math.min(2999, Number(q.get('from') ?? 1900) || 1900)), to = Math.max(from + 1, Math.min(3000, Number(q.get('to') ?? 2100) || 2100));
        if (to - from > 500) throw new HttpError(400, 'bad_param', 'Ask for at most 500 years of lunations at a time');
        const k0 = lunationNear(Date.UTC(2000, 0, 1) + (from - 2000) * 365.2425 * 86_400_000), k1 = lunationNear(Date.UTC(2000, 0, 1) + (to - 2000) * 365.2425 * 86_400_000);
        const lunations = [];
        for (let k = k0; k < k1; k++) lunations.push({ k, utc: new Date(Math.round(trueNewMoonMs(k))).toISOString(), gap_h: Math.round(gapHours(k) * 1000) / 1000 });
        return json({
          about: 'Real new moon minus the start of the matching lunation on Moon\'s grid, in hours. The gap wobbles by up to about 14 hours as the Moon speeds up and slows down; Moon drifts only if the century averages move.',
          method: 'True new moons: Meeus, Astronomical Algorithms, ch. 49, all periodic and planetary terms; UTC via Espenak & Meeus Delta T. Grid: equal lunations of 29.530588853 days from the real new moon of 6 January 2000.',
          grid_anchor: new Date(gridNewMoonMs(0)).toISOString(),
          range: { from_year: from, to_year: to }, lunations, centuries: driftByCentury(-2000, 3000),
        }, 200, { ...FOREVER, ...planHdr });
      }

      case path === `/${API_VERSION}/status`: {
        // Is Moon working right now? Every part checked live, with the dates that matter.
        const t0 = Date.now(), nowNs = nowUnixNs();
        const part = async <T,>(f: () => Promise<T>) => { const a = Date.now(); try { return { ok: true, ms: Date.now() - a, ...(await f()) }; } catch (e) { return { ok: false, ms: Date.now() - a, error: e instanceof Error ? e.message : 'failed' }; } };
        const days = (iso: string) => Math.floor((Date.parse(iso) - Date.now()) / 86_400_000);
        const cert = (der: Uint8Array | string) => { const c = new X509Certificate(typeof der === 'string' ? der : Buffer.from(der)); const na = new Date(c.validTo).toISOString(); return { subject: c.subject.split('\n').find((l) => l.startsWith('CN='))?.slice(3) ?? c.subject, not_after_utc: na, days_left: days(na) }; };
        const [signing, beacon, tsa, tideline] = await Promise.all([
          part(async () => {
            if (!env.SIGNER) throw new Error('Signing is not configured');
            return { mode: env.SIGNER.pq ? 'hybrid' : 'ed25519', keys: [env.SIGNER.info(), ...(env.SIGNER.pq ? [env.SIGNER.pq.info()] : [])].map((k) => ({ key_id: k.key_id, alg: k.alg })) };
          }),
          part(async () => {
            if (!env.BEACON) throw new Error('No beacon configured');
            const b = await env.BEACON(nowNs);
            if (!b) throw new Error('drand did not answer in time');
            return { network: b.network, round: b.round, age_s: Math.round(Number(nowNs - roundTimeNs(b.round)) / 1e9) };
          }),
          part(async () => {
            if (!env.TSA) throw new Error('The time-stamp authority is not configured');
            return { certificate: cert(env.TSA.leaf), root: cert(MOON_ROOT_PEM) };
          }),
          part(async () => {
            if (!env.TIDES) throw new Error('The Tideline is not configured');
            const open = luneOf(nowNs), head = await env.TIDES.head(), first = await env.TIDES.first();
            const next = head === null ? first : head + 1;
            const behind = next !== null && next < open ? luneEndNs(next) : null;
            const overdue = behind !== null && nowNs - behind > 26n * 3_600_000_000_000n;
            const last = head === null ? null : await env.TIDES.getTide(head);
            return { open_lune: luneLabel(open), seals_after_utc: unixNsToIso(luneEndNs(open)), last_sealed: last ? { lune: last.lune, size: last.size, sealed_utc: unixNsToIso(BigInt(last.sealed_unix_ns)), bitcoin: last.bitcoin ? { status: last.bitcoin.status, block_height: last.bitcoin.block_height ?? null } : null } : null,
              waiting_to_seal: behind === null ? 0 : open - next!, overdue, anchoring: { bitcoin: !!env.BITCOIN, xrpl: !!env.ANCHOR } };
          }),
        ]);
        const problems = [
          ...(!signing.ok ? ['signing'] : []), ...(!beacon.ok ? ['beacon'] : []), ...(!tsa.ok ? ['timestamps'] : []), ...(!tideline.ok ? ['tideline'] : []),
          ...(tideline.ok && (tideline as { overdue?: boolean }).overdue ? ['tideline_overdue'] : []),
          ...(tsa.ok && ((tsa as { certificate: { days_left: number } }).certificate.days_left < 60) ? ['tsa_certificate_expiring'] : []),
        ];
        return json({ ok: problems.length === 0, problems, checked_utc: unixNsToIso(nowNs), took_ms: Date.now() - t0, signing, beacon, timestamps: tsa, tideline }, 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/tideline`: {
        if (!env.TIDES) throw new HttpError(503, 'tideline_unavailable', 'The Tideline is not configured on this deployment');
        const idx = await env.TIDES.recent(30);
        const tides = (await Promise.all(idx.map((i) => env.TIDES!.getTide(i)))).filter(Boolean);
        const open = luneOf(nowUnixNs());
        return json({ tideline: TIDELINE, about: 'Every lune, Moon seals its signed Moonmarks into a tide: a Merkle root of every receipt, chained to the previous tide and signed with Moon\'s keys.', open_lune: luneLabel(open), seals_after_utc: unixNsToIso(luneEndNs(open)), anchoring: { xrpl: !!env.ANCHOR, bitcoin: !!env.BITCOIN }, head: tides[0] ?? null, tides }, 200, { 'Cache-Control': 'public, max-age=60', ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/tideline/`): {
        if (!env.TIDES) throw new HttpError(503, 'tideline_unavailable', 'The Tideline is not configured on this deployment');
        let label = decodeURIComponent(path.slice(`/${API_VERSION}/tideline/`.length));
        const fmt = /\.ots$/.test(label) ? 'ots' : /\.txt$/.test(label) ? 'txt' : 'json';
        label = label.replace(/\.(ots|txt)$/, '');
        const lune = parseLune(label);
        if (lune === null) throw new HttpError(400, 'bad_param', 'Use a lune like 1928.05.05');
        const tide = await env.TIDES.getTide(lune);
        if (tide && fmt === 'txt') return new Response(Buffer.from(tideBytes(tide)), { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="tide-${tide.lune}.txt"`, 'Cache-Control': 'public, max-age=31536000, immutable' } });
        if (tide && fmt === 'ots') {
          const f = await env.TIDES.getOts(lune);
          if (!f) throw new HttpError(404, 'not_found', 'This tide has no Bitcoin proof yet');
          return new Response(new Uint8Array(f), { headers: { ...CORS, 'Content-Type': 'application/vnd.opentimestamps.v1', 'Content-Disposition': `attachment; filename="tide-${tide.lune}.txt.ots"`, 'Cache-Control': 'public, max-age=300' } });
        }
        if (tide) {
          // A sealed tide with every entry, so anyone can recompute its Merkle root and each entry's proof.
          const all = await env.TIDES.leaves(lune), MAXS = 5000;
          const entries = all.slice(0, MAXS).map((leaf, index) => ({ index, leaf }));
          return json({ ...tide, status: 'sealed', entries, ...(all.length > MAXS ? { entries_truncated: true } : {}) }, 200, { 'Cache-Control': 'public, max-age=300', ...planHdr });
        }
        const leaves = await env.TIDES.leaves(lune), size = leaves.length;
        const last = (await env.TIDES.checkpoints(lune)).at(-1) ?? null;
        // The lune's entries so far, in order: the public log before it seals. A leaf is a one-way fingerprint of a receipt.
        const MAX = 2000;
        const entries = leaves.slice(0, MAX).map((leaf, index) => ({ index, leaf }));
        return json({ tideline: TIDELINE, lune: luneLabel(lune), last_checkpoint: last, status: luneEndNs(lune) > nowUnixNs() ? 'open' : 'pending', size, seals_after_utc: unixNsToIso(luneEndNs(lune)),
          entries, ...(size > MAX ? { entries_truncated: true } : {}) }, 200, { 'Cache-Control': 'public, max-age=30', ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/cycle/`) || path.startsWith(`/${API_VERSION}/year/`): {
        const y = parseIntParam(path.split('/').pop() ?? null, 'cycle')!;
        return json(yearInfo(y), 200, { ...FOREVER, ...planHdr });
      }
    }
    return json({ error: { code: 'not_found', message: `No route ${path}` } }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
    if (e instanceof MoonRangeError) return json({ error: { code: 'out_of_range', message: e.message } }, 400);
    return json({ error: { code: 'internal', message: 'Unexpected error' } }, 500);
  }
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
};
