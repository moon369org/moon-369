import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Signer, PqSigner } from '../src/receipt';
import { memoryStore, record, sealDue, luneOf, luneStartNs, parseLune, stats, type Tide } from '../src/tideline';
import { formatMoonmark, toMoon } from '../src/moon';
// The published package's audit, run against tides this API seals: the two must agree byte for byte.
import { auditTideline } from '../../packages/moon369/dist/index.js';

const pq = new PqSigner(new Uint8Array(randomBytes(32)));
const signer = new Signer(generateKeyPairSync('ed25519').privateKey, pq);
const keys = { [signer.keyId]: signer.info().public_key, [pq.keyId]: pq.info().public_key };

async function world() {
  const store = memoryStore(), now = BigInt(Date.now()) * 1_000_000n, l0 = luneOf(now) - 5;
  for (let i = 0; i < 9; i++) { const ns = luneStartNs(l0 + (i % 3) * 2) + BigInt(i) * 1_000_000_000n; await record(store, signer.sign(String(i).repeat(64), formatMoonmark(toMoon(ns)), ns, null)); }
  await sealDue(store, signer, now);
  const edits: Record<string, (t: Tide & { entries: { index: number; leaf: string }[] }) => void> = {};
  const fetchFn = (async (url: string) => {
    const p = new URL(url).pathname, j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (p === '/v1/stats') return j(await stats(store, now));
    const label = p.replace('/v1/tideline/', ''), l = parseLune(label)!, t = await store.getTide(l);
    if (!t) return j({ status: 'pending', size: (await store.leaves(l)).length });
    const b = { ...t, status: 'sealed', entries: (await store.leaves(l)).map((leaf, index) => ({ index, leaf })) };
    edits[label]?.(b);
    return j(b);
  }) as typeof fetch;
  return { store, l0, edits, fetchFn };
}

describe('independent audit', () => {
  it('passes an honest Tideline', async () => {
    const w = await world();
    const rep = await auditTideline({ api: 'https://x.test', keys, fetch: w.fetchFn });
    expect(rep.problems).toEqual([]);
    expect(rep.ok).toBe(true);
    expect(rep.receipts).toBe(9);
    expect(rep.sealed).toBeGreaterThanOrEqual(5);
  });
  it('catches a dropped receipt, a broken chain and a forged signature', async () => {
    const w = await world();
    const rep0 = await auditTideline({ api: 'https://x.test', keys, fetch: w.fetchFn });
    const [a, b, c] = rep0.tides.map((t) => t.lune);
    w.edits[a] = (t) => { t.entries[0].leaf = '00'.repeat(32); };
    w.edits[b] = (t) => { t.prev = 'ff'.repeat(32); };
    w.edits[c] = (t) => { t.root = 'ee'.repeat(32); };
    const rep = await auditTideline({ api: 'https://x.test', keys, fetch: w.fetchFn });
    expect(rep.ok).toBe(false);
    expect(rep.problems.join('\n')).toMatch(new RegExp(`${a}: its entries do not hash`));
    expect(rep.problems.join('\n')).toMatch(new RegExp(`${b}: hash or signature`));
    expect(rep.problems.join('\n')).toMatch(new RegExp(`${c}: hash or signature`));
  });
  it('rejects tides signed by someone else', async () => {
    const w = await world();
    const other = new Signer(generateKeyPairSync('ed25519').privateKey);
    const rep = await auditTideline({ api: 'https://x.test', keys: { [other.keyId]: other.info().public_key }, fetch: w.fetchFn });
    expect(rep.ok).toBe(false);
  });
});
