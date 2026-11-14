// Vercel Function entry. vercel.json rewrites every path here; strip a leading /api
// so the router always sees the public path (/v1/now, not /api/v1/now).
import { handle } from '../src/index.js';
import { memoryLimiter, upstashLimiter } from '../src/ratelimit.js';
import { Signer, loadPrivateKey } from '../src/receipt.js';

// Open tier: requests per minute per IP. Shared across instances when Upstash is configured.
const PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
const RATE_LIMITER = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? upstashLimiter(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN, PER_MIN)
  : memoryLimiter(PER_MIN);

// Signing key for Moonmark receipts (MOON_SIGNING_KEY: Ed25519, PEM or base64 PKCS8).
let SIGNER: Signer | undefined;
try { if (process.env.MOON_SIGNING_KEY) SIGNER = new Signer(loadPrivateKey(process.env.MOON_SIGNING_KEY)); } catch { SIGNER = undefined; }
// Retired public keys, so old receipts keep verifying: JSON {"key_id":"base64url raw key"}.
let RETIRED_KEYS: Record<string, string> | undefined;
try { if (process.env.MOON_RETIRED_KEYS) RETIRED_KEYS = JSON.parse(process.env.MOON_RETIRED_KEYS); } catch { RETIRED_KEYS = undefined; }

const route = (req: Request) => {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return handle(new Request(url, req), {
    CLOCK_ACCURACY_NS: process.env.CLOCK_ACCURACY_NS,
    CLOCK_SOURCE: process.env.CLOCK_SOURCE,
    RATE_LIMITER,
    SIGNER,
    RETIRED_KEYS,
  });
};

export const GET = route;
export const HEAD = route;
export const OPTIONS = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
