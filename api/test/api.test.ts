import { hashKey, envKeyStore, newKey } from '../src/keys';
import { describe, it, expect } from 'vitest';
import { handle, type Env, type KeyStore, type RateLimiter } from '../src/index';

const get = (path: string, env: Env = {}, headers: Record<string, string> = {}) =>
  handle(new Request(`https://api.example.org${path}`, { headers }), env);

const limiter = (allow: boolean): RateLimiter => ({ limit: async () => ({ success: allow }) });

const kv = (store: Record<string, string>) => ({ get: async (k: string) => store[k] ?? null }) as KeyStore;

describe('routes', () => {
  it('GET /v1/now returns the current Moon time', async () => {
    const r = await get('/v1/now');
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const b: any = await r.json();
    expect(b.moon).toBeGreaterThanOrEqual(1);
    expect(b.moonmark).toMatch(/^\d+\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}\.\d{9}$/);
    expect(b.time_zone).toBeNull();
    expect(typeof b.unix_ns).toBe('string');
  });

  it('GET /v1/moonmark with unix_ns is exact and immutable', async () => {
    const r = await get('/v1/moonmark?unix_ns=1794516299901000000');
    const b: any = await r.json();
    expect(b.moonmark).toBe('1928.05.03 08:57:39.035909351');
    expect(b.clock).toBe('client');
    expect(b.accuracy_ns).toBeNull();
    expect(r.headers.get('Cache-Control')).toContain('immutable');
  });

  it('GET /v1/stamp (old name) without input reports server accuracy', async () => {
    const b: any = await (await get('/v1/stamp', { CLOCK_ACCURACY_NS: '1000', CLOCK_SOURCE: 'server-ptp' })).json();
    expect(b.accuracy_ns).toBe(1000);
    expect(b.clock).toBe('server-ptp');
  });

  it('GET /v1/convert accepts unix ms, unix_ns and utc', async () => {
    const a: any = await (await get('/v1/convert?unix=1794517059035')).json();
    const b: any = await (await get('/v1/convert?unix_ns=1794517059035000000')).json();
    const c: any = await (await get('/v1/convert?utc=2026-11-12T22:57:39.035Z')).json();
    expect(a.moonmark).toBe(b.moonmark);
    expect([a.year, a.moon, a.day]).toEqual([1928, 5, 3]);
    expect(c.year).toBe(1928);
  });

  it('GET /v1/convert?format=string returns plain text', async () => {
    const r = await get('/v1/convert?unix_ns=1794516299901000000&format=string');
    expect(await r.text()).toBe('1928.05.03 08:57:39.035909351');
  });

  it('GET /v1/to-unix round-trips with /v1/convert', async () => {
    const t: any = await (await get('/v1/to-unix?year=1928&moon=6&day=1&time=12:30:00.5')).json();
    const back: any = await (await get(`/v1/convert?unix_ns=${t.unix_ns}`)).json();
    expect(back.moonmark).toBe('1928.06.01 12:30:00.500000000');
  });

  it('GET /v1/to-unix accepts a Moonmark', async () => {
    const t: any = await (await get('/v1/to-unix?moonmark=1928.05.03%2008:57:39.035909351')).json();
    expect(t.unix_ns).toBe('1794516299901000000');
  });

  it('GET /v1/year/{year} returns 13 moons', async () => {
    const b: any = await (await get('/v1/year/1928')).json();
    expect(b.moons).toHaveLength(13);
    expect(b.days).toBe(369);
  });

  it('GET /v1/spec returns the exact constants', async () => {
    const b: any = await (await get('/v1/spec')).json();
    expect(b.epoch_unix_ns).toBe('-62165308562978611200');
    expect(b.moon_lengths_days.reduce((x: number, y: number) => x + y, 0)).toBe(369);
  });
});

describe('errors', () => {
  it('400 on impossible Moon dates', async () => {
    const r = await get('/v1/to-unix?year=1928&moon=2&day=29');
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error.code).toBe('out_of_range');
  });
  it('400 on missing convert input', async () => {
    expect((await get('/v1/convert')).status).toBe(400);
  });
  it('400 on non-integer params', async () => {
    expect((await get('/v1/convert?unix=12.5')).status).toBe(400);
  });
  it('404 on unknown routes', async () => {
    expect((await get('/v1/nope')).status).toBe(404);
  });
  it('405 on POST', async () => {
    const r = await handle(new Request('https://api.example.org/v1/now', { method: 'POST' }), {});
    expect(r.status).toBe(405);
  });
  it('204 on CORS preflight', async () => {
    const r = await handle(new Request('https://api.example.org/v1/now', { method: 'OPTIONS' }), {});
    expect(r.status).toBe(204);
  });
});

describe('limits and keys', () => {
  it('429 when the open limit is hit', async () => {
    const r = await get('/v1/now', { RATE_LIMITER: limiter(false) });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
  });
  it('valid key uses the keyed tier', async () => {
    const env: Env = { RATE_LIMITER: limiter(false), RATE_LIMITER_KEYED: limiter(true), API_KEYS: kv({ [hashKey('k_123')]: '{"plan":"pro"}' }) };
    const r = await get('/v1/now', env, { Authorization: 'Bearer k_123' });
    expect(r.status).toBe(200);
    expect(r.headers.get('X-Moon-Plan')).toBe('pro');
  });
  it('401 on unknown key', async () => {
    const r = await get('/v1/now', { API_KEYS: kv({}) }, { Authorization: 'Bearer nope' });
    expect(r.status).toBe(401);
  });
  it('keys are looked up by hash, never raw', async () => {
    const r = await get('/v1/now', { API_KEYS: kv({ k_123: '{"plan":"pro"}' }) }, { Authorization: 'Bearer k_123' });
    expect(r.status).toBe(401);
  });
  it('403 on a switched-off key', async () => {
    const r = await get('/v1/now', { API_KEYS: kv({ [hashKey('k_off')]: '{"plan":"pro","active":false}' }) }, { Authorization: 'Bearer k_off' });
    expect(r.status).toBe(403);
  });
  it('per-key limit is passed to the limiter', async () => {
    let seen: number | undefined;
    const env: Env = { RATE_LIMITER_KEYED: { async limit(o) { seen = o.max; return { success: false }; } }, API_KEYS: kv({ [hashKey('k_9')]: '{"plan":"pro","per_min":5}' }) };
    const r = await get('/v1/now', env, { Authorization: 'Bearer k_9' });
    expect(seen).toBe(5);
    expect(r.status).toBe(429);
  });
  it('GET /v1/me reports the plan', async () => {
    const env: Env = { API_KEYS: envKeyStore(JSON.stringify({ [hashKey('k_me')]: { owner: 'Acme', plan: 'pro', per_min: 2000 } })) };
    const b: any = await (await get('/v1/me', env, { Authorization: 'Bearer k_me' })).json();
    expect(b).toMatchObject({ plan: 'pro', owner: 'Acme', per_min: 2000, keyed: true });
    const o: any = await (await get('/v1/me', {})).json();
    expect(o.plan).toBe('open');
  });
  it('health and index bypass limits', async () => {
    expect((await get('/health', { RATE_LIMITER: limiter(false) })).status).toBe(200);
  });
});

describe('Moonmark links', () => {
  it('GET /v1/m/{moonmark} resolves the URL form a QR code carries', async () => {
    const b: any = await (await get('/v1/m/1928.05.03-08.57.39.035909351')).json();
    expect(b.moonmark).toBe('1928.05.03 08:57:39.035909351');
    expect(b.unix_ns).toBe('1794516299901000000');
    expect(b.moonmark_url).toBe('https://moon369.org/m/1928.05.03-08.57.39.035909351');
    expect(b.sun).toBeUndefined();
    expect(b.light).toBeUndefined();
  });
});

describe('core only', () => {
  it('removed endpoints return 404', async () => {
    for (const p of ['/v1/light?lat=40.71&lon=-74.01', '/v1/sun?tz=UTC', '/v1/schedule?light=06:45&lat=40.71&lon=-74.01', '/v1/seasons/1928'])
      expect((await get(p)).status).toBe(404);
  });
});

describe('key helpers', () => {
  it('newKey makes moon_ keys that hash to 64 hex', () => {
    const k = newKey();
    expect(k).toMatch(/^moon_[A-Za-z0-9_-]{32}$/);
    expect(hashKey(k)).toMatch(/^[0-9a-f]{64}$/);
    expect(newKey()).not.toBe(k);
  });
  it('envKeyStore rejects a non-object', () => {
    expect(() => envKeyStore('[]')).toThrow();
  });
});

describe('cycle naming', () => {
  it('returns cycle alongside year, and serves /v1/cycle/{n}', async () => {
    const { handle } = await import('../src/index.js');
    const now = await (await handle(new Request('http://x/v1/convert?utc=2026-11-15T00:00:00Z'))).json() as Record<string, unknown>;
    expect(now.cycle).toBe(now.year);
    expect(now.day_of_cycle).toBe(now.day_of_year);
    const c = await (await handle(new Request('http://x/v1/cycle/1928'))).json() as Record<string, unknown>;
    expect(c.cycle).toBe(1928);
    const t = await (await handle(new Request('http://x/v1/to-unix?cycle=1928&moon=5&day=5'))).json() as Record<string, unknown>;
    const u = await (await handle(new Request('http://x/v1/to-unix?year=1928&moon=5&day=5'))).json() as Record<string, unknown>;
    expect(t.unix_ns).toBe(u.unix_ns);
  });
});

describe('free signing limits', () => {
  it('limits signing on the open tier but not reads, and keys skip it', async () => {
    const { memoryLimiter } = await import('../src/ratelimit.js');
    const { handle } = await import('../src/index.js');
    const env = { SIGN_LIMIT_MIN: memoryLimiter(2), SIGN_LIMIT_DAY: memoryLimiter(100, 86_400_000), SIGN_LIMITS: { per_min: 2, per_day: 100 } };
    const sign = () => handle(new Request('http://x/v1/sign', { method: 'POST', headers: { 'x-real-ip': '9.9.9.9' }, body: JSON.stringify({ sha256: 'a'.repeat(64) }) }), env);
    expect((await sign()).status).toBe(503);   // passes the limit (no signer configured here)
    expect((await sign()).status).toBe(503);
    const third = await sign();
    expect(third.status).toBe(429);
    expect(((await third.json()) as { error: { code: string } }).error.code).toBe('sign_rate_limited');
    const read = await handle(new Request('http://x/v1/now', { headers: { 'x-real-ip': '9.9.9.9' } }), env);
    expect(read.status).toBe(200);
  });
});
