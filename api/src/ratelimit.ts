/**
 * Rate limiters for the open tier. Fixed one-minute windows, keyed by client IP.
 * - upstashLimiter: shared across every server instance (Upstash Redis REST). Use in production.
 * - memoryLimiter: per instance only. A fallback so a limit always exists.
 * Both fail open: if the store can't be reached, the request goes through.
 */
import type { RateLimiter } from './index.js';

export function memoryLimiter(perMinute: number): RateLimiter {
  const hits = new Map<string, { w: number; n: number }>();
  return {
    async limit({ key }) {
      const w = Math.floor(Date.now() / 60_000);
      const h = hits.get(key);
      if (!h || h.w !== w) {
        if (hits.size > 50_000) hits.clear();
        hits.set(key, { w, n: 1 });
        return { success: true };
      }
      h.n++;
      return { success: h.n <= perMinute };
    },
  };
}

export function upstashLimiter(url: string, token: string, perMinute: number, prefix = 'moon:rl'): RateLimiter {
  return {
    async limit({ key }) {
      const k = `${prefix}:${key}:${Math.floor(Date.now() / 60_000)}`;
      try {
        const r = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([['INCR', k], ['EXPIRE', k, '70']]),
        });
        if (!r.ok) return { success: true };
        const out = (await r.json()) as { result: number }[];
        return { success: Number(out[0]?.result ?? 0) <= perMinute };
      } catch {
        return { success: true };
      }
    },
  };
}
