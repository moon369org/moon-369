// Vercel Function entry. vercel.json rewrites every path here; strip a leading /api
// so the router always sees the public path (/v1/now, not /api/v1/now).
import { handle } from '../src/index.js';
import { memoryLimiter, upstashLimiter } from '../src/ratelimit.js';

// Open tier: requests per minute per IP. Shared across instances when Upstash is configured.
const PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
const RATE_LIMITER = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? upstashLimiter(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN, PER_MIN)
  : memoryLimiter(PER_MIN);

const route = (req: Request) => {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return handle(new Request(url, req), {
    CLOCK_ACCURACY_NS: process.env.CLOCK_ACCURACY_NS,
    CLOCK_SOURCE: process.env.CLOCK_SOURCE,
    RATE_LIMITER,
  });
};

export const GET = route;
export const HEAD = route;
export const OPTIONS = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
