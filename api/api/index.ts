// Vercel Function entry. vercel.json rewrites every path here; strip a leading /api
// so the router always sees the public path (/v1/now, not /api/v1/now).
import { handle } from '../src/index.js';
import { memoryLimiter, upstashLimiter } from '../src/ratelimit.js';
import { Signer, PqSigner, loadPrivateKey } from '../src/receipt.js';
import { envKeyStore } from '../src/keys.js';
import { beaconSource } from '../src/beacon.js';
import { upstashStore } from '../src/tideline.js';
import { xrplAnchorer } from '../src/anchor.js';
import { stamp, upgrade, summarize } from '../src/ots.js';
import { waitUntil } from '@vercel/functions';
import { TsaSigner } from '../src/tsa.js';
import { MOON_TSA_PEM } from '../src/tsa-certs.js';

// Upstash Redis, from the Vercel Marketplace (KV_*) or set by hand (UPSTASH_*). Shared by rate limits and the Tideline.
const RL_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const RL_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

// Open tier: requests per minute per IP. Shared across instances when Upstash is configured.
const PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
const RATE_LIMITER = RL_URL && RL_TOKEN
  ? upstashLimiter(RL_URL, RL_TOKEN, PER_MIN)
  : memoryLimiter(PER_MIN);

// Customer API keys: MOON_API_KEYS is JSON of SHA-256(key) -> { owner, plan, per_min, active }.
// Each key gets its own per-minute limit (per_min, default KEY_RATE_LIMIT_PER_MIN).
const KEY_PER_MIN = Number(process.env.KEY_RATE_LIMIT_PER_MIN ?? 1000);
let API_KEYS: ReturnType<typeof envKeyStore> | undefined;
try { if (process.env.MOON_API_KEYS) API_KEYS = envKeyStore(process.env.MOON_API_KEYS); } catch { API_KEYS = undefined; }
const RATE_LIMITER_KEYED = RL_URL && RL_TOKEN
  ? upstashLimiter(RL_URL, RL_TOKEN, KEY_PER_MIN, 'moon:rlk')
  : memoryLimiter(KEY_PER_MIN);

// Free signing on the open tier (sign, tsa, evidence): small, so volume comes through API keys.
const SIGN_PER_MIN = Number(process.env.SIGN_RATE_PER_MIN ?? 10);
const SIGN_PER_DAY = Number(process.env.SIGN_RATE_PER_DAY ?? 100);
const SIGN_LIMIT_MIN = RL_URL && RL_TOKEN ? upstashLimiter(RL_URL, RL_TOKEN, SIGN_PER_MIN, 'moon:rls') : memoryLimiter(SIGN_PER_MIN);
const SIGN_LIMIT_DAY = RL_URL && RL_TOKEN ? upstashLimiter(RL_URL, RL_TOKEN, SIGN_PER_DAY, 'moon:rld', 86_400_000) : memoryLimiter(SIGN_PER_DAY, 86_400_000);

// Signing key for Moonmark receipts (MOON_SIGNING_KEY: Ed25519, PEM or base64 PKCS8).
let SIGNER: Signer | undefined;
// Post-quantum key (MOON_PQ_KEY: 32-byte ML-DSA-65 seed, base64). With it, receipts are hybrid v3 (Ed25519 + ML-DSA-65).
let PQ: PqSigner | undefined;
try { if (process.env.MOON_PQ_KEY) PQ = PqSigner.fromEnv(process.env.MOON_PQ_KEY); } catch { PQ = undefined; }
try { if (process.env.MOON_SIGNING_KEY) SIGNER = new Signer(loadPrivateKey(process.env.MOON_SIGNING_KEY), PQ); } catch { SIGNER = undefined; }
// Retired public keys, so old receipts keep verifying: JSON {"key_id":"base64url raw key"}.
let RETIRED_KEYS: Record<string, string> | undefined;
try { if (process.env.MOON_RETIRED_KEYS) RETIRED_KEYS = JSON.parse(process.env.MOON_RETIRED_KEYS); } catch { RETIRED_KEYS = undefined; }

// drand quicknet beacon for v2 receipts (proves each receipt was signed after a public random value).
const BEACON = process.env.MOON_BEACON === 'off' ? undefined : beaconSource();

// The Tideline: Upstash Redis (from the Vercel Marketplace: KV_REST_API_URL/TOKEN, or UPSTASH_REDIS_REST_URL/TOKEN).
const TL_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TL_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const TIDES = TL_URL && TL_TOKEN ? upstashStore(TL_URL, TL_TOKEN) : undefined;
// Anchoring on the XRP Ledger (XRPL_SEED: the wallet's secret seed).
// Bitcoin anchoring through OpenTimestamps: free, no keys. MOON_OTS=off disables it.
const BITCOIN = process.env.MOON_OTS === 'off' ? undefined : { stamp: (d: string) => stamp(d), upgrade: (f: Buffer) => upgrade(f), summarize };
const ANCHOR = process.env.XRPL_SEED ? xrplAnchorer(process.env.XRPL_SEED, process.env.XRPL_SERVER) : undefined;

// RFC 3161 Time-Stamp Authority (MOON_TSA_KEY: EC P-256 private key, PEM or base64 of the PEM).
// The certificate is public and ships in the code; MOON_TSA_CERT overrides it with a PEM chain.
let TSA: TsaSigner | undefined;
try { if (process.env.MOON_TSA_KEY) TSA = new TsaSigner(process.env.MOON_TSA_KEY, process.env.MOON_TSA_CERT ?? MOON_TSA_PEM); } catch { TSA = undefined; }

const route = (req: Request) => {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return handle(new Request(url, req), {
    CLOCK_ACCURACY_NS: process.env.CLOCK_ACCURACY_NS,
    CLOCK_SOURCE: process.env.CLOCK_SOURCE,
    RATE_LIMITER,
    RATE_LIMITER_KEYED,
    SIGN_LIMIT_MIN,
    SIGN_LIMIT_DAY,
    SIGN_LIMITS: { per_min: SIGN_PER_MIN, per_day: SIGN_PER_DAY },
    API_KEYS,
    SIGNER,
    RETIRED_KEYS,
    BEACON,
    TIDES,
    ANCHOR,
    BITCOIN,
    TSA,
    DEFER: (p: Promise<unknown>) => waitUntil(p),
    CRON_SECRET: process.env.CRON_SECRET,
  });
};

export const GET = route;
export const HEAD = route;
export const OPTIONS = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
