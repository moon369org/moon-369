import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { Signer, PqSigner } from '../../../api/src/receipt.js';
import * as TL from '../../../api/src/tideline.js';
import { randomBytes } from 'node:crypto';
import * as api from '../../../api/src/moon.js';
import { receiptLeaf, verifyInclusion as libIncl, verifyTide } from '../src/index.js';
import { moonmark, moon, fromMoonmark, moonmarkToDate, moonmarkUrl, moonPhase, toNs, nowNs, verify, fingerprint } from '../src/index.js';

describe('same math as the API', () => {
  it('src/moon.ts is an exact copy of the API reference', () => {
    const a = readFileSync(new URL('../../../api/src/moon.ts', import.meta.url), 'utf8');
    const b = readFileSync(new URL('../src/moon.ts', import.meta.url), 'utf8');
    expect(b).toBe(a);
  });
  it('matches the API for random moments', () => {
    for (let i = 0; i < 500; i++) {
      const ns = BigInt(Math.floor(Math.random() * 4e18)) - 2_000_000_000_000_000_000n;
      expect(moonmark(ns)).toBe(api.formatMoonmark(api.toMoon(ns)));
    }
  });
});

describe('moonmarks', () => {
  it('round-trips to the nanosecond', () => {
    const ns = 1_794_682_325_123_456_789n;
    const mk = moonmark(ns);
    expect(mk).toMatch(/^\d+\.\d\d\.\d\d \d\d:\d\d:\d\d\.\d{9}$/);
    const back = fromMoonmark(mk);
    expect(moonmark(back)).toBe(mk);
    expect(back <= ns && ns - back < 2n).toBe(true);
  });
  it('accepts Date, ms, ISO string and the URL form', () => {
    const d = new Date('2026-11-14T12:00:00Z');
    expect(moonmark(d)).toBe(moonmark(d.getTime()));
    expect(moonmark(d)).toBe(moonmark('2026-11-14T12:00:00Z'));
    const mk = moonmark(d);
    expect(fromMoonmark(mk.replace(' ', '-').replace(/:/g, '.'))).toBe(fromMoonmark(mk));
    expect(moonmarkToDate(mk).getTime()).toBe(d.getTime());
    expect(moonmarkUrl(mk)).toBe('https://moon369.org/m/' + mk.replace(' ', '-').replace(/:/g, '.'));
  });
  it('now is close to Date.now', () => {
    expect(Number(nowNs() / 1_000_000n) - Date.now()).toBeLessThan(50);
    expect(moon().year).toBeGreaterThan(1900);
  });
  it('rejects bad input', () => {
    expect(() => toNs('not a date')).toThrow();
    expect(() => fromMoonmark('1928.14.01')).toThrow();
  });
  it('moon phase', () => {
    const p = moonPhase('2026-11-14T12:00:00Z');
    expect(p.illumination).toBeGreaterThanOrEqual(0);
    expect(p.illumination).toBeLessThanOrEqual(1);
    expect(typeof p.name).toBe('string');
  });
});

describe('signed Moonmarks', () => {
  const signer = new Signer(generateKeyPairSync('ed25519').privateKey);
  const info = signer.info();
  const keys = { [info.key_id]: info.public_key };

  it('fingerprint is SHA-256 hex', async () => {
    expect(await fingerprint('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await fingerprint(new TextEncoder().encode('abc'))).toBe(await fingerprint('abc'));
    expect(await fingerprint(new Blob(['abc']))).toBe(await fingerprint('abc'));
  });

  it('verifies a receipt Moon signed, offline', async () => {
    const sha = await fingerprint('hello moon');
    const ns = 1_794_682_325_123_456_789n;
    const r = signer.sign(sha, api.formatMoonmark(api.toMoon(ns)), ns);
    const out = await verify(r, { keys });
    expect(out).toMatchObject({ valid: true, moonmark: r.moonmark, key_id: info.key_id });
    expect(await verify(r, { keys, content: 'hello moon' })).toMatchObject({ valid: true });
    expect(await verify(r, { keys, content: 'hello sun' })).toEqual({ valid: false, reason: 'content_mismatch' });
    expect(await verify(r, { keys, sha256: sha.toUpperCase() })).toMatchObject({ valid: true });
  });

  it('catches tampering', async () => {
    const ns = 1_794_682_325_123_456_789n;
    const r = signer.sign('a'.repeat(64), api.formatMoonmark(api.toMoon(ns)), ns);
    expect(await verify({ ...r, sha256: 'b'.repeat(64) }, { keys })).toEqual({ valid: false, reason: 'bad_signature' });
    expect(await verify({ ...r, unix_ns: (ns + 1n).toString() }, { keys })).toEqual({ valid: false, reason: 'bad_signature' });
    expect(await verify(r, { keys: {} })).toEqual({ valid: false, reason: 'unknown_key' });
    expect(await verify({ ...r, receipt: 'x' }, { keys })).toEqual({ valid: false, reason: 'unknown_version' });
    expect(await verify(null, { keys })).toEqual({ valid: false, reason: 'not_a_receipt' });
    const forged = signer.sign('a'.repeat(64), '1928.01.01 00:00:00.000000000', ns);
    expect(await verify(forged, { keys })).toEqual({ valid: false, reason: 'moonmark_mismatch' });
  });
});

describe('v2 receipts with a drand beacon', () => {
  const CHAIN = { public_key: '81d320f220ee9c79e60e19dedc838c31e3ab919b15481e9feb52f643628c4f6a13fdc52129493875a818109d767272ca0541cbcdcea9335f2870d781b39b845ba8cbd44fdfe4967781cf72ca5917fc9398bcf97ca0548ed5a709016c4b1ff0f3', period: 3, genesis_time: 1687506816 };
  const B = { network: 'drand-quicknet' as const, round: 38, signature: '95c93585c513ebbcb4777ff15599b3140e5ec0295faa0e483f3deadd88fa6d43f0d3703e3a4ce106e8fd6c6987f32126' };
  const signer = new Signer(generateKeyPairSync('ed25519').privateKey);
  const keys = { [signer.info().key_id]: signer.info().public_key };
  const nb = (1687506816n + 37n * 3n) * 1_000_000_000n;
  const ns = nb + 2_000_000_000n;
  it('verifies offline and reports not_before', async () => {
    const r = signer.sign('a'.repeat(64), api.formatMoonmark(api.toMoon(ns)), ns, B);
    expect(await verify(r, { keys, beaconChain: CHAIN })).toMatchObject({ valid: true, not_before: { unix_ns: nb, round: 38 } });
  });
  it('catches a fake beacon and backdating', async () => {
    const fake = signer.sign('a'.repeat(64), api.formatMoonmark(api.toMoon(ns)), ns, { ...B, round: 39 });
    expect(await verify(fake, { keys, beaconChain: CHAIN })).toEqual({ valid: false, reason: 'bad_beacon' });
    const early = nb - 60_000_000_000n;
    const back = signer.sign('a'.repeat(64), api.formatMoonmark(api.toMoon(early)), early, B);
    expect(await verify(back, { keys, beaconChain: CHAIN })).toEqual({ valid: false, reason: 'beacon_after_moment' });
    const r = signer.sign('a'.repeat(64), api.formatMoonmark(api.toMoon(ns)), ns, B);
    expect(await verify(r, { keys })).toEqual({ valid: false, reason: 'bad_beacon' });
  });
});

describe('hybrid v3 receipts', () => {
  const pq = new PqSigner(new Uint8Array(randomBytes(32)));
  const signer = new Signer(generateKeyPairSync('ed25519').privateKey, pq);
  const keys = { [signer.keyId]: signer.info().public_key, [pq.keyId]: pq.info().public_key };
  const ns = 1_794_682_325_123_456_789n;
  it('verifies both signatures offline', async () => {
    const r = signer.sign('e'.repeat(64), api.formatMoonmark(api.toMoon(ns)), ns, null);
    expect(await verify(r, { keys })).toMatchObject({ valid: true, post_quantum: true });
    const bad = { ...r, pq: { ...r.pq!, signature: r.pq!.signature!.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) } };
    expect(await verify(bad, { keys })).toEqual({ valid: false, reason: 'bad_pq_signature' });
    const { signature: _s, ...short } = r.pq!;
    expect(await verify({ ...r, pq: short }, { keys })).toMatchObject({ valid: true, post_quantum: false });
  });
});

describe('Tideline checks', () => {
  it('leaf, inclusion and tide match the API exactly', async () => {
    const pq2 = new PqSigner(new Uint8Array(randomBytes(32)));
    const sg = new Signer(generateKeyPairSync('ed25519').privateKey, pq2);
    const keys = { [sg.keyId]: sg.info().public_key, [pq2.keyId]: pq2.info().public_key };
    const store = TL.memoryStore();
    const l = TL.luneOf(1_794_682_325_000_000_000n);
    const rs = [];
    for (let i = 0; i < 5; i++) { const ns = TL.luneStartNs(l) + BigInt(i + 1) * 1000n; const r = sg.sign(String(i).repeat(64), api.formatMoonmark(api.toMoon(ns)), ns, null); rs.push(r); await TL.record(store, r); }
    const [tide] = await TL.sealDue(store, sg, TL.luneEndNs(l));
    expect(await verifyTide(tide as any, keys)).toBe(true);
    expect(await verifyTide({ ...(tide as any), size: 6 }, keys)).toBe(false);
    for (const r of rs) {
      expect(receiptLeaf(r as any)).toBe(TL.receiptLeaf(r));
      const p: any = await TL.proofFor(store, r);
      expect(libIncl(receiptLeaf(r as any), p.index, p.size, p.path, p.root)).toBe(true);
    }
  });
});
