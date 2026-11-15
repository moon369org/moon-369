import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Signer, PqSigner, verifySignedBytes } from '../src/receipt';
import { memoryStore, sealDue, luneOf, luneEndNs } from '../src/tideline';
import { handle, evidenceBytes, canonicalJson, type Env } from '../src/index';

const pq = new PqSigner(new Uint8Array(randomBytes(32)));
const signer = new Signer(generateKeyPairSync('ed25519').privateKey, pq);
const keys = { [signer.keyId]: signer.info().public_key, [pq.keyId]: pq.info().public_key };
const post = (path: string, body: unknown, env: Env) => handle(new Request('https://api.example.org' + path, { method: 'POST', body: JSON.stringify(body) }), env);

describe('evidence statements', () => {
  it('canonical JSON sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
  });
  it('signs what it found: valid receipt, file match, Tideline status', async () => {
    const store = memoryStore();
    const env: Env = { SIGNER: signer, TIDES: store };
    const s: any = await (await post('/v1/sign', { sha256: 'ab'.repeat(32) }, env)).json();
    let e: any = await (await post('/v1/evidence', { receipt: s.receipt, sha256: 'ab'.repeat(32) }, env)).json();
    expect(e.statement.checks).toMatchObject({ valid: true, content_match: true, post_quantum: true, signatures: ['Ed25519', 'ML-DSA-65'] });
    expect(e.statement.tideline.status).toBe('pending');
    expect(verifySignedBytes(evidenceBytes(e.statement), e.signature, keys)).toBe(true);           // Moon signed it, both algorithms
    expect(verifySignedBytes(evidenceBytes({ ...e.statement, checks: { ...e.statement.checks, valid: false } }), e.signature, keys)).toBe(false);
    // after the lune seals, the statement carries the tide
    await sealDue(store, signer, luneEndNs(luneOf(BigInt(s.receipt.unix_ns))));
    e = await (await post('/v1/evidence', { receipt: s.receipt }, env)).json();
    expect(e.statement.tideline).toMatchObject({ status: 'sealed', index: 0, size: 1 });
    expect(e.statement.checks.content_match).toBeNull();
    expect(e.proof.status).toBe('sealed');
  });
  it('a wrong file or a forged receipt is stated plainly', async () => {
    const env: Env = { SIGNER: signer };
    const s: any = await (await post('/v1/sign', { sha256: 'cd'.repeat(32) }, env)).json();
    const wrong: any = await (await post('/v1/evidence', { receipt: s.receipt, sha256: 'ef'.repeat(32) }, env)).json();
    expect(wrong.statement.checks).toMatchObject({ valid: false, reason: 'content_mismatch', content_match: false });
    const forged: any = await (await post('/v1/evidence', { receipt: { ...s.receipt, moonmark: '1928.01.01 00:00:00.000000000' } }, env)).json();
    expect(forged.statement.checks.valid).toBe(false);
    expect(forged.statement.tideline.status).toBe('not_configured');
  });
});
