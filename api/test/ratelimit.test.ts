import { describe, it, expect } from 'vitest';
import { memoryLimiter } from '../src/ratelimit';
import { handle } from '../src/index';

describe('rate limiting', () => {
  it('memory limiter allows up to the limit per minute, then blocks', async () => {
    const l = memoryLimiter(3);
    const r = [];
    for (let i = 0; i < 4; i++) r.push((await l.limit({ key: 'a' })).success);
    expect(r).toEqual([true, true, true, false]);
    expect((await l.limit({ key: 'b' })).success).toBe(true);
  });
  it('returns 429 with Retry-After when the open tier is exhausted', async () => {
    const env = { RATE_LIMITER: memoryLimiter(1) };
    const req = () => new Request('https://api.moon369.org/v1/now', { headers: { 'x-real-ip': '9.9.9.9' } });
    expect((await handle(req(), env)).status).toBe(200);
    const blocked = await handle(req(), env);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('60');
  });
});
