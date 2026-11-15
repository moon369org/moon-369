import { createHash } from 'node:crypto';
import {
  SPEC_VERSION, EPOCH_UNIX_NS, LUNATION_NS, NUM, DEN, MOON_SECOND_SI, YEAR_DAYS, MOONS,
  toMoon, toUnixNs, formatMoonmark, parseMoonmark, moonmarkPath, truePhase, illumination, phaseName, unixNsToIso, yearInfo,
  moonLength, MoonRangeError, type MoonTime,
} from './moon.js';
import { cardSvg, shareSvg } from './card.js';
import { TsaSigner, TsaReject, parseRequest as parseTsq, issue as issueTst, reject as tsaReject, FAIL as TSA_FAIL, TSA_POLICY, TSA_EXT_MOONMARK } from './tsa.js';
import { MOON_ROOT_PEM } from './tsa-certs.js';
import { svgToPng } from './png.js';
import { hashKey } from './keys.js';
import { Signer, verifyReceipt, isSha256Hex, RECEIPT_V1, RECEIPT_V2, RECEIPT_V3, RECEIPT_VERSIONS, PQ_ALG, type Receipt } from './receipt.js';
import { QUICKNET, BEACON_NETWORK, type Beacon, type Chain } from './beacon.js';
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
  /** RFC 3161 Time-Stamp Authority signer (MOON_TSA_KEY + certificate). Optional. */
  TSA?: TsaSigner;
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
  lune: { name: 'lune', definition: 'A lune is a Moon day: one 369th of a Moon year, 86,400 Moon seconds. It turns over at the same instant everywhere. 369 lunes make 13 moons, locked to the real moon. It is a unit of the Moon count, not daylight.', moon_seconds: 86_400, si_seconds: Math.round(86_400 * Number(DEN) / Number(NUM) * 1000) / 1000, per_year: YEAR_DAYS },
  days_per_year: YEAR_DAYS,
  moons_per_year: MOONS,
  moon_lengths_days: Array.from({ length: MOONS }, (_, i) => moonLength(i + 1)),
  mean_lunation_ns: LUNATION_NS,
  epoch_unix_ns: EPOCH_UNIX_NS,
  epoch_utc: unixNsToIso(EPOCH_UNIX_NS),
  time_base: 'Unix time (no leap seconds)',
  time_zones: null,
  dst: false,
  roles: { moon: 'One continuous count of time, locked to the real moon, read as the date (year, moon, lune) and the phase.', moonmark: 'One exact moment on the Moon count, the same everywhere: YEAR.MM.DD HH:MM:SS.NNNNNNNNN.' },
  date_rule: 'The Moon date is global: one date worldwide. A lune turns over at the same instant everywhere.',
  illumination: { meaning: 'Fraction of the moon\'s disc lit by the sun at that instant, seen from Earth (0 to 1). Not the moon\'s age.', method: 'Phase angle from the Moon-Sun elongation, the Moon latitude and the Earth-Moon and Earth-Sun distances, using the principal periodic terms of Meeus, Astronomical Algorithms, ch. 47-48', checked_against: 'PyEphem: within 0.05 percentage points (mean 0.01) at 3,000 random moments, 2000-2050' },
  signing: { receipt: 'moonmark-receipt/3', alg: 'Ed25519 + ML-DSA-65 (hybrid)', hybrid: 'v3 receipts carry two signatures over the same bytes: Ed25519 and ML-DSA-65 (NIST FIPS 204, post-quantum). A full v3 receipt is valid only if both check out, so it stays unforgeable while either algorithm holds. A v3 receipt without its ML-DSA signature (as in a short link) is checked with Ed25519 only and reported with post_quantum: false.', upgrades: 'Moon is designed to upgrade its cryptography. Every receipt names its version, new versions are added through the proposals process, and every version ever issued stays verifiable: old keys stay published as retired.', versions: { 'moonmark-receipt/1': 'Ed25519', 'moonmark-receipt/2': 'Ed25519 + drand beacon', 'moonmark-receipt/3': 'Ed25519 + ML-DSA-65, drand beacon when available' }, signed_bytes: 'receipt, "sha256:" + hex, moonmark, unix_ns, key_id, then "drand-quicknet:" + round + ":" + beacon signature hex (v2, and v3 when present), then "ml-dsa-65:" + post-quantum key_id (v3), joined by newlines (UTF-8)', beacon: { network: BEACON_NETWORK, meaning: 'The latest drand quicknet round Moon had seen when it signed. Its value could not be known before it was published, so the receipt was signed after that round. Check it offline with the League of Entropy public key.', chain_hash: QUICKNET.hash, public_key: QUICKNET.public_key, period_s: QUICKNET.period, genesis_time: QUICKNET.genesis_time, scheme: QUICKNET.scheme }, v1: 'moonmark-receipt/1 receipts have no beacon and stay valid', key_id: 'first 16 hex of SHA-256 of the raw 32-byte public key', keys: '/v1/keys', sign: 'POST /v1/sign {"sha256":"<hex>"}', verify: 'POST /v1/verify {"receipt":{...}}' },
  license: 'MIT',
};

type Gate = { plan: string; owner?: string; per_min?: number };

async function authAndLimit(req: Request, env: Env): Promise<Gate | Response> {
  const auth = req.headers.get('Authorization');
  const key = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (key) {
    if (!env.API_KEYS) return json({ error: { code: 'keys_disabled', message: 'This deployment does not accept API keys' } }, 400);
    const hash = hashKey(key);
    const raw = await env.API_KEYS.get(hash);
    let rec: { plan?: string; owner?: string; per_min?: number; active?: boolean } | null = null;
    try { rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
    if (!rec) return json({ error: { code: 'invalid_key', message: 'Unknown API key' } }, 401);
    if (rec.active === false) return json({ error: { code: 'key_disabled', contact: 'moon369org@proton.me', message: 'This API key is switched off. Email moon369org@proton.me.' } }, 403);
    const per_min = Number.isFinite(rec.per_min) && rec.per_min! > 0 ? Math.floor(rec.per_min!) : undefined;
    if (env.RATE_LIMITER_KEYED && !(await env.RATE_LIMITER_KEYED.limit({ key: hash.slice(0, 32), max: per_min })).success) {
      return json({ error: { code: 'rate_limited', contact: 'moon369org@proton.me', message: `Key rate limit reached${per_min ? ` (${per_min} requests a minute)` : ''}. For a higher limit email moon369org@proton.me.` } }, 429, { 'Retry-After': '60' });
    }
    return { plan: rec.plan ?? 'keyed', owner: rec.owner, per_min };
  }
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anonymous';
  if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: ip })).success) {
    return json({ error: { code: 'rate_limited', contact: 'moon369org@proton.me', message: 'Open rate limit reached (120 requests a minute). For higher limits email moon369org@proton.me, or run the MIT reference code locally.' } }, 429, { 'Retry-After': '60' });
  }
  return { plan: 'open' };
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 16_384) throw new HttpError(413, 'too_large', 'Send only the SHA-256 fingerprint or the receipt, not the content');
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
async function signNow(env: Env, sha: string, at?: bigint) {
  const S = env.SIGNER!;
  let beacon: Beacon | null = null;
  if (env.BEACON) { try { beacon = await env.BEACON(nowUnixNs()); } catch { beacon = null; } }
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
  return {
    receipt,
    tideline,
    moonmark_url: MARK_BASE + moonmarkPath(mark),
    signed_url: MARK_BASE + moonmarkPath(mark) + `?s=${receipt.sha256}&u=${receipt.unix_ns}&k=${receipt.key_id}` + (receipt.beacon ? `&r=${receipt.beacon.round}&b=${receipt.beacon.signature}` : '') + (receipt.pq ? `&q=${receipt.pq.key_id}` : '') + `&g=${receipt.signature}`,
    utc: unixNsToIso(ns),
    accuracy_ns: Number(env.CLOCK_ACCURACY_NS ?? 1_000_000),
    clock: env.CLOCK_SOURCE ?? 'server-ntp',
  };
}

/** RFC 3161 time-stamping: DER in, DER out. */
async function tsaResponse(req: Request, env: Env, planHdr: Record<string, string>): Promise<Response> {
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
    try { const out = await signNow(env, Buffer.from(parsed.digest).toString('hex'), ns); moonmarkUrl = out.signed_url; mark = out.receipt.moonmark; } catch { moonmarkUrl = undefined; }
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
  if (path === `/${API_VERSION}/tsa` && req.method === 'POST') {
    const gate = await authAndLimit(req, env);
    if (gate instanceof Response) return gate;
    return tsaResponse(req, env, { 'X-Moon-Plan': gate.plan });
  }
  const postOnly = path === `/${API_VERSION}/sign` || path === `/${API_VERSION}/verify` || path === `/${API_VERSION}/evidence` || path === `/${API_VERSION}/tideline/proof`;
  if (postOnly ? req.method !== 'POST' : (req.method !== 'GET' && req.method !== 'HEAD'))
    return json({ error: { code: 'method_not_allowed', message: postOnly ? 'Use POST with a JSON body' : 'Use GET' } }, 405, postOnly ? { Allow: 'POST, OPTIONS' } : {});

  if (path === '/' ) return json({ name: 'Moon API', version: API_VERSION, spec: SPEC_VERSION, docs: '/v1/spec', endpoints: ['/v1/now', '/v1/moonmark', '/v1/m/{moonmark}', '/v1/convert', '/v1/to-unix', '/v1/year/{year}', '/v1/spec', '/v1/card.svg', '/v1/card.png', '/v1/keys', '/v1/me', 'POST /v1/sign', 'POST /v1/verify', '/v1/tideline', '/v1/tideline/{lune}', 'POST /v1/tideline/proof', 'POST /v1/evidence', 'POST /v1/tsa (RFC 3161)', '/v1/tsa'] });
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
        const svg = cardSvg({ year: t.year, moon: t.moon, lune: t.day, lunesInMoon: moonLength(t.moon), fraction: ph, illumination: illumination(ns), name: phaseName(ph), title: fixed ? 'MOONMARK' : undefined }, size);
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
        const svg = shareSvg({ year: t.year, moon: t.moon, lune: t.day, lunesInMoon: moonLength(t.moon), fraction: ph, illumination: illumination(ns), name: phaseName(ph),
          time: `${p2(t.hour)}:${p2(t.minute)}:${p2(t.second)}`, ns: String(t.nanosecond).padStart(9, '0'), title: fixed ? 'MOONMARK' : 'TODAY ON MOON' });
        const png = svgToPng(svg, 1200);
        return new Response(req.method === 'HEAD' ? null : new Uint8Array(png), { status: 200, headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*',
          ...(fixed ? FOREVER : { 'Cache-Control': 'public, max-age=60' }),
          ...planHdr,
        } });
      }

      case path.startsWith(`/${API_VERSION}/m/`): {
        // Resolve a Moonmark link (what a Moonmark QR code points to).
        const raw = decodeURIComponent(path.slice(`/${API_VERSION}/m/`.length));
        const ns = toUnixNs(parseMoonmark(raw));
        return json(moonBody(toMoon(ns), ns), 200, { ...FOREVER, ...planHdr });
      }

      case path === `/${API_VERSION}/to-unix`: {
        const input = moonInputFromQuery(q);
        const ns = toUnixNs(input);
        return json({ input, unix_ns: ns, unix_ms: Number(ns / 1_000_000n), utc: unixNsToIso(ns) }, 200, { ...FOREVER, ...planHdr });
      }

      case path === `/${API_VERSION}/me`:
        return json({ plan: gate.plan, ...(gate.owner ? { owner: gate.owner } : {}), per_min: gate.per_min ?? null, keyed: gate.plan !== 'open' }, 200, { 'Cache-Control': 'no-store', ...planHdr });

      case path === `/${API_VERSION}/keys`: {
        const keys = [
          ...(env.SIGNER ? [env.SIGNER.info()] : []),
          ...(env.SIGNER?.pq ? [env.SIGNER.pq.info()] : []),
          ...Object.entries(env.RETIRED_KEYS ?? {}).map(([key_id, public_key]) => ({ key_id, alg: Buffer.from(public_key, 'base64url').length === 32 ? 'Ed25519' : PQ_ALG, public_key, status: 'retired' })),
        ];
        return json({ receipt: env.SIGNER?.pq ? RECEIPT_V3 : env.BEACON ? RECEIPT_V2 : RECEIPT_V1, receipts_accepted: RECEIPT_VERSIONS, keys, signing: env.SIGNER ? (env.SIGNER.pq ? 'hybrid' : 'enabled') : 'not_configured' }, 200, { 'Cache-Control': 'public, max-age=300', ...planHdr });
      }

      case path === `/${API_VERSION}/sign`: {
        if (!env.SIGNER) throw new HttpError(503, 'signing_unavailable', 'Signing is not configured on this deployment');
        const body = await readJson(req);
        const sha = typeof body.sha256 === 'string' ? body.sha256.toLowerCase() : body.sha256;
        if (!isSha256Hex(sha)) throw new HttpError(400, 'bad_param', 'sha256 must be the 64-character hex SHA-256 of your content. Send the fingerprint, never the content.');
        return json(await signNow(env, sha), 200, { 'Cache-Control': 'no-store', ...planHdr });
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
        const r = (body.receipt ?? body) as Receipt;
        return json(checkReceipt(r, body.sha256, env), 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/evidence`: {
        if (!env.SIGNER) throw new HttpError(503, 'signing_unavailable', 'Signing is not configured on this deployment');
        const body = await readJson(req);
        const r = (body.receipt ?? body) as Receipt;
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
        const r = (body.receipt ?? body) as Receipt;
        if (!r || typeof r !== 'object' || typeof (r as Receipt).unix_ns !== 'string' || !/^-?\d+$/.test((r as Receipt).unix_ns)) throw new HttpError(400, 'bad_param', 'Send a signed Moonmark receipt');
        return json(await proofFor(env.TIDES, r), 200, { 'Cache-Control': 'no-store', ...planHdr });
      }

      case path === `/${API_VERSION}/tideline`: {
        if (!env.TIDES) throw new HttpError(503, 'tideline_unavailable', 'The Tideline is not configured on this deployment');
        const idx = await env.TIDES.recent(30);
        const tides = (await Promise.all(idx.map((i) => env.TIDES!.getTide(i)))).filter(Boolean);
        const open = luneOf(nowUnixNs());
        return json({ tideline: TIDELINE, about: 'Every lune, Moon seals its signed Moonmarks into a tide: a Merkle root, chained to the previous tide, signed and anchored on the XRP Ledger.', open_lune: luneLabel(open), seals_after_utc: unixNsToIso(luneEndNs(open)), head: tides[0] ?? null, tides }, 200, { 'Cache-Control': 'public, max-age=60', ...planHdr });
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
        if (tide) return json(tide, 200, { 'Cache-Control': 'public, max-age=300', ...planHdr });
        const size = (await env.TIDES.leaves(lune)).length;
        const last = (await env.TIDES.checkpoints(lune)).at(-1) ?? null;
        return json({ tideline: TIDELINE, lune: luneLabel(lune), last_checkpoint: last, status: luneEndNs(lune) > nowUnixNs() ? 'open' : 'pending', size, seals_after_utc: unixNsToIso(luneEndNs(lune)) }, 200, { 'Cache-Control': 'public, max-age=60', ...planHdr });
      }

      case path.startsWith(`/${API_VERSION}/year/`): {
        const y = parseIntParam(path.split('/').pop() ?? null, 'year')!;
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
