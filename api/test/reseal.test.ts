import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { handle } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { canonical, resealFingerprint } from '../src/reseal.js';

const env = { SIGNER: new Signer(generateKeyPairSync('ed25519').privateKey) };
const post = (path: string, body: object) => handle(new Request('https://x' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env as never);

describe('re-sealing', () => {
  it('sorts keys at every level', () => {
    expect(canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 'x' } })).toBe('{"a":{"c":"x","d":[2,{"y":2,"z":1}]},"b":1}');
  });
  it('re-seals a valid receipt and checks it', async () => {
    const old = ((await (await post('/v1/sign', { sha256: 'ab'.repeat(32) })).json()) as { receipt: Record<string, unknown> }).receipt;
    const r = await post('/v1/reseal', { receipt: old });
    const j = await r.json() as { fingerprint: string; receipt: { sha256: string } };
    expect(r.status).toBe(200);
    expect(j.fingerprint).toBe(resealFingerprint(old));
    expect(j.receipt.sha256).toBe(j.fingerprint);
    const v = await (await post('/v1/reseal/verify', { receipt: j.receipt, of: old })).json() as { valid: boolean; original: { still_valid: boolean } };
    expect(v.valid).toBe(true); expect(v.original.still_valid).toBe(true);
    // same receipt with keys in another order: same fingerprint
    const shuffled = Object.fromEntries(Object.entries(old).reverse());
    expect(((await (await post('/v1/reseal/verify', { receipt: j.receipt, of: shuffled })).json()) as { valid: boolean }).valid).toBe(true);
    // a changed old receipt is not covered
    expect(((await (await post('/v1/reseal/verify', { receipt: j.receipt, of: { ...old, moonmark: 'x' } })).json()) as { valid: boolean }).valid).toBe(false);
  });
  it('refuses receipts that no longer check out', async () => {
    const old = ((await (await post('/v1/sign', { sha256: 'cd'.repeat(32) })).json()) as { receipt: Record<string, unknown> }).receipt;
    expect((await post('/v1/reseal', { receipt: { ...old, sha256: 'ef'.repeat(32) } })).status).toBe(400);
  });
});
