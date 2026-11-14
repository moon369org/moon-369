import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Signer, PqSigner, verifySignedBytes } from '../src/receipt';
import { memoryStore, record, sealDue, proofFor, luneOf, luneLabel, parseLune, luneEndNs, luneStartNs, tideBytes, tideHashOk, receiptLeaf } from '../src/tideline';
import { verifyInclusion } from '../src/merkle';
import { formatMoonmark, toMoon } from '../src/moon';
import { handle, type Env } from '../src/index';

const pq = new PqSigner(new Uint8Array(randomBytes(32)));
const signer = new Signer(generateKeyPairSync('ed25519').privateKey, pq);
const keys = { [signer.keyId]: signer.info().public_key, [pq.keyId]: pq.info().public_key };
const signAt = (ns: bigint, i: number) => signer.sign(String(i % 10).repeat(64), formatMoonmark(toMoon(ns)), ns, null);

describe('lunes', () => {
  it('labels, parses and bounds a lune', () => {
    const ns = 1_794_682_325_123_456_789n, l = luneOf(ns);
    expect(luneLabel(l)).toBe(formatMoonmark(toMoon(ns)).slice(0, 10));
    expect(parseLune(luneLabel(l))).toBe(l);
    expect(luneStartNs(l) <= ns && ns < luneEndNs(l)).toBe(true);
    expect(luneOf(luneEndNs(l))).toBe(l + 1);
    expect(Number(luneEndNs(l) - luneStartNs(l)) / 1e9).toBeCloseTo(89888.23, 1);
  });
});

describe('the Tideline', () => {
  it('records, seals a chain of tides, and proves inclusion', async () => {
    const store = memoryStore();
    const l0 = luneOf(1_794_682_325_000_000_000n);
    const receipts = [];
    for (let i = 0; i < 7; i++) { const r = signAt(luneStartNs(l0) + BigInt(i) * 1_000_000_000n, i); receipts.push(r); await record(store, r); }
    const r2 = signAt(luneStartNs(l0 + 2) + 5n, 9); await record(store, r2); // lune l0+1 stays empty
    // nothing is sealed while the lune is open
    expect(await sealDue(store, signer, luneEndNs(l0) - 1n)).toEqual([]);
    expect((await proofFor(store, receipts[3])).status).toBe('pending');
    const anchored: string[] = [];
    const tides = await sealDue(store, signer, luneEndNs(l0 + 2) + 1n, async (t) => { anchored.push(t.hash); return { network: 'xrpl', tx: 'ABC', explorer: 'x' }; });
    expect(tides.map((t) => [t.lune_index - l0, t.size])).toEqual([[0, 7], [1, 0], [2, 1]]);
    expect(tides[0].prev).toBeNull();
    expect(tides[1].prev).toBe(tides[0].hash);
    expect(tides[2].prev).toBe(tides[1].hash);
    expect(anchored).toEqual(tides.map((t) => t.hash));
    for (const t of tides) {
      expect(tideHashOk(t)).toBe(true);
      expect(verifySignedBytes(tideBytes(t), t, keys)).toBe(true); // Ed25519 + ML-DSA-65
    }
    // running again seals nothing new (idempotent)
    expect(await sealDue(store, signer, luneEndNs(l0 + 2) + 10n)).toEqual([]);
    // every receipt proves into its tide
    for (const r of receipts) {
      const p: any = await proofFor(store, r);
      expect(p.status).toBe('sealed');
      expect(verifyInclusion(receiptLeaf(r), p.index, p.size, p.path, p.tide.root)).toBe(true);
    }
    // a receipt Moon never logged is not found
    expect((await proofFor(store, signAt(luneStartNs(l0) + 99n, 4))).status).toBe('not_found');
    // a changed tide fails its own hash and signature
    const bad = { ...tides[0], size: 8 };
    expect(tideHashOk(bad)).toBe(false);
    expect(verifySignedBytes(tideBytes(bad), bad, keys)).toBe(false);
  });

  it('API: sign logs the receipt, the cron seals, anyone can read and prove', async () => {
    const store = memoryStore();
    const env: Env = { SIGNER: signer, TIDES: store, CRON_SECRET: 's3cret' };
    const s: any = await (await handle(new Request('https://api.example.org/v1/sign', { method: 'POST', body: JSON.stringify({ sha256: 'f'.repeat(64) }) }), env)).json();
    expect(s.tideline).toMatchObject({ status: 'pending', index: 0 });
    expect((await handle(new Request('https://api.example.org/v1/tideline/seal'), env)).status).toBe(403);
    const open: any = await (await handle(new Request(`https://api.example.org/v1/tideline/${s.tideline.lune}`), env)).json();
    expect(open).toMatchObject({ status: 'open', size: 1 });
    const pr: any = await (await handle(new Request('https://api.example.org/v1/tideline/proof', { method: 'POST', body: JSON.stringify({ receipt: s.receipt }) }), env)).json();
    expect(pr.status).toBe('pending');
    const list: any = await (await handle(new Request('https://api.example.org/v1/tideline'), env)).json();
    expect(list.tideline).toBe('tideline/1');
  });

  it('503 when not configured', async () => {
    expect((await handle(new Request('https://api.example.org/v1/tideline'), {})).status).toBe(503);
  });
});
