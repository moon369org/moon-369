import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Signer, PqSigner, verifyReceipt } from '../src/receipt';
import { roundTimeNs, type Chain } from '../src/beacon';
import { handle, type Env } from '../src/index';
import { formatMoonmark, toMoon } from '../src/moon';

const CHAIN: Chain = { public_key: '81d320f220ee9c79e60e19dedc838c31e3ab919b15481e9feb52f643628c4f6a13fdc52129493875a818109d767272ca0541cbcdcea9335f2870d781b39b845ba8cbd44fdfe4967781cf72ca5917fc9398bcf97ca0548ed5a709016c4b1ff0f3', period: 3, genesis_time: 1687506816 };
const B = { network: 'drand-quicknet' as const, round: 38, signature: '95c93585c513ebbcb4777ff15599b3140e5ec0295faa0e483f3deadd88fa6d43f0d3703e3a4ce106e8fd6c6987f32126' };

describe('hybrid v3 receipts (Ed25519 + ML-DSA-65)', () => {
  const pq = new PqSigner(new Uint8Array(randomBytes(32)));
  const signer = new Signer(generateKeyPairSync('ed25519').privateKey, pq);
  const keys = { [signer.keyId]: signer.info().public_key, [pq.keyId]: pq.info().public_key };
  const ns = roundTimeNs(38, CHAIN) + 1_000_000_000n;
  const mark = formatMoonmark(toMoon(ns));

  it('signs with both and verifies only when both check out', () => {
    const r = signer.sign('c'.repeat(64), mark, ns, B);
    expect(r.receipt).toBe('moonmark-receipt/3');
    expect(r.pq!.signature!.length).toBeGreaterThan(4000);
    expect(verifyReceipt(r, keys, CHAIN)).toMatchObject({ valid: true, post_quantum: true, beacon_round: 38 });
    // a forged Ed25519 half does not pass on its own: tamper the post-quantum signature
    const bad = { ...r, pq: { ...r.pq!, signature: r.pq!.signature!.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) } };
    expect(verifyReceipt(bad, keys, CHAIN).reason).toBe('bad_pq_signature');
    // tampering the Ed25519 half fails too
    expect(verifyReceipt({ ...r, signature: r.signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) }, keys, CHAIN).reason).toBe('bad_signature');
    // swapping in another post-quantum key id breaks the Ed25519 signature (the key id is signed)
    expect(verifyReceipt({ ...r, pq: { ...r.pq!, key_id: 'ffffffffffffffff' } }, keys, CHAIN).reason).toBe('bad_signature');
  });
  it('a short-link form without the ML-DSA signature checks Ed25519 only and says so', () => {
    const r = signer.sign('c'.repeat(64), mark, ns, B);
    const { signature: _drop, ...pqNoSig } = r.pq!;
    expect(verifyReceipt({ ...r, pq: pqNoSig }, keys, CHAIN)).toMatchObject({ valid: true, post_quantum: false });
  });
  it('works without a beacon and needs the post-quantum public key', () => {
    const r = signer.sign('c'.repeat(64), mark, ns, null);
    expect(r.beacon).toBeUndefined();
    expect(verifyReceipt(r, keys)).toEqual({ valid: true, post_quantum: true });
    expect(verifyReceipt(r, { [signer.keyId]: signer.info().public_key }).reason).toBe('unknown_key');
  });
  it('API: /v1/keys lists both keys, /v1/sign issues v3, /v1/verify reports both signatures', async () => {
    const env: Env = { SIGNER: signer, BEACON: async () => B, BEACON_CHAIN: CHAIN };
    const k: any = await (await handle(new Request('https://api.example.org/v1/keys'), env)).json();
    expect(k.signing).toBe('hybrid');
    expect(k.keys.map((x: any) => x.alg)).toEqual(['Ed25519', 'ML-DSA-65']);
    expect(k.receipts_accepted).toEqual(['moonmark-receipt/1', 'moonmark-receipt/2', 'moonmark-receipt/3']);
    const s: any = await (await handle(new Request('https://api.example.org/v1/sign', { method: 'POST', body: JSON.stringify({ sha256: 'd'.repeat(64) }) }), env)).json();
    expect(s.receipt.receipt).toBe('moonmark-receipt/3');
    expect(s.signed_url).toContain('&q=' + pq.keyId);
    const v: any = await (await handle(new Request('https://api.example.org/v1/verify', { method: 'POST', body: JSON.stringify({ receipt: s.receipt }) }), env)).json();
    expect(v).toMatchObject({ valid: true, post_quantum: true, signatures: ['Ed25519', 'ML-DSA-65'] });
  });
});
