import { describe, it, expect, vi, afterEach } from 'vitest';
import { upstashRegistry, type Registration } from '../src/registry.js';

// A tiny Redis that speaks the commands the registry sends over Upstash's pipeline API.
function fakeRedis() {
  const kv = new Map<string, unknown>();
  const z = (k: string) => (kv.get(k) as Map<string, number>) ?? (kv.set(k, new Map()).get(k) as Map<string, number>);
  const score = (s: string | number, hi: boolean) => s === '+inf' ? Infinity : s === '-inf' ? -Infinity : typeof s === 'string' && s.startsWith('(') ? Number(s.slice(1)) + (hi ? -1e-9 : 1e-9) : Number(s);
  const run = (c: (string | number)[]): unknown => {
    const [cmd, k, ...a] = c as [string, string, ...(string | number)[]];
    switch (cmd) {
      case 'RPUSH': { const l = (kv.get(k) as string[]) ?? []; l.push(String(a[0])); kv.set(k, l); return l.length; }
      case 'LRANGE': { const l = (kv.get(k) as string[]) ?? []; const e = Number(a[1]); return l.slice(Number(a[0]), e < 0 ? undefined : e + 1); }
      case 'SADD': { const s = (kv.get(k) as Set<string>) ?? new Set(); s.add(String(a[0])); kv.set(k, s); return 1; }
      case 'SRANDMEMBER': case 'SMEMBERS': return [...((kv.get(k) as Set<string>) ?? [])];
      case 'ZADD': z(k).set(String(a[1]), Number(a[0])); return 1;
      case 'ZRANGE': {
        if (!a.includes('BYSCORE')) { const all = [...z(k)].sort((x, y) => x[1] - y[1]).map(([m]) => m); const e = Number(a[1]); return all.slice(Number(a[0]), e < 0 ? undefined : e + 1); }
        const rev = a.includes('REV'), li = a.indexOf('LIMIT'), off = Number(a[li + 1]), cnt = Number(a[li + 2]);
        const [lo, hi] = rev ? [score(a[1], false), score(a[0], true)] : [score(a[0], false), score(a[1], true)];
        const items = [...z(k)].filter(([, s]) => s >= lo && s <= hi).sort((x, y) => rev ? y[1] - x[1] : x[1] - y[1]);
        return items.slice(off, off + cnt).map(([m]) => m);
      }
      case 'GET': return kv.has(k) ? kv.get(k) : null;
      case 'SET': { if (a.includes('NX') && kv.has(k)) return null; kv.set(k, a[0]); return 'OK'; }
      case 'SCAN': return ['0', [...kv.keys()].filter((x) => x.startsWith('rg:sha:'))];
      case 'DEL': kv.delete(k); return 1;
    }
    throw new Error('unknown ' + cmd);
  };
  return { kv, fetch: async (_u: string, init: { body: string }) => new Response(JSON.stringify((JSON.parse(init.body) as (string | number)[][]).map((c) => ({ result: run(c) })))) };
}
const reg = (sha: string, ms: number, who: string, verified: boolean): Registration => ({
  registration: 'moon-registration/1', sha256: sha, moonmark: 'm', unix_ns: String(BigInt(ms) * 1_000_000n), registrant: who, registrant_verified: verified,
  on_behalf_of: null, label: sha[0] + '.png', phash: null, receipt_signature: 's', signed_url: 'u', signature: { key_id: 'k', signature: 's' },
});

describe('registry on Upstash', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('indexes by time and by verified name, and backfills older registrations once', async () => {
    const r = fakeRedis(); vi.stubGlobal('fetch', r.fetch);
    const store = upstashRegistry('https://x', 't');
    // an old registration, written before the indexes existed
    r.kv.set('rg:sha:' + 'a'.repeat(64), [JSON.stringify(reg('a'.repeat(64), 1000, 'Moon', true))]);
    await store.add(reg('b'.repeat(64), 2000, 'Moon', true));
    await store.add(reg('c'.repeat(64), 3000, 'anonymous', false));
    expect((await store.byTime!(0, 10_000, 50)).map((x) => x.sha256[0])).toEqual(['a', 'b', 'c']);
    expect((await store.byTime!(1500, 3000, 50)).map((x) => x.sha256[0])).toEqual(['b']);
    expect((await store.byRegistrant!('moon', 50)).map((x) => x.sha256[0])).toEqual(['b', 'a']);
    expect((await store.byRegistrant!('moon', 50, 2000)).map((x) => x.sha256[0])).toEqual(['a']);
    expect(r.kv.get('rg:ix:v1')).toBe('done');
    expect((await store.byLabel!('B.PNG', 50)).map((x) => x.sha256[0])).toEqual(['b']);   // verified only, any case
    expect(await store.byLabel!('c.png', 50)).toEqual([]);
    await store.addLeaf!('f'.repeat(64), 'b'.repeat(64)); expect(await store.shaByLeaf!('f'.repeat(64))).toBe('b'.repeat(64));
  });
});
