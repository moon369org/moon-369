import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { handle } from '../src/index';
import { Signer, verifyReceipt, signedBytes, keyIdOf, loadPrivateKey } from '../src/receipt';

const { privateKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const der = (privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer).toString('base64');
const signer = new Signer(loadPrivateKey(pem));
const env = { SIGNER: signer };
const sha = createHash('sha256').update('hello moon').digest('hex');
const post = (p: string, body: unknown, e: object = env) =>
  handle(new Request('https://api.moon369.org' + p, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), e);
const get = (p: string, e: object = env) => handle(new Request('https://api.moon369.org' + p), e);

describe('signed Moonmarks', () => {
  it('loads PEM and base64 DER keys to the same key id', () => {
    expect(new Signer(loadPrivateKey(der)).keyId).toBe(signer.keyId);
    expect(signer.keyId).toBe(keyIdOf(signer.pub));
    expect(signer.keyId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('publishes the public key at /v1/keys', async () => {
    const b = await (await get('/v1/keys')).json() as any;
    expect(b.signing).toBe('enabled');
    expect(b.keys[0]).toMatchObject({ key_id: signer.keyId, alg: 'Ed25519', status: 'active' });
    expect((await (await get('/v1/keys', {})).json() as any).signing).toBe('not_configured');
  });

  it('signs a fingerprint and the receipt verifies offline and online', async () => {
    const r = await post('/v1/sign', { sha256: sha });
    expect(r.status).toBe(200);
    const b = await r.json() as any;
    expect(b.receipt).toMatchObject({ receipt: 'moonmark-receipt/1', sha256: sha, key_id: signer.keyId });
    expect(b.receipt.moonmark).toMatch(/^\d+\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}\.\d{9}$/);
    expect(b.moonmark_url).toContain('https://moon369.org/m/');
    const keys = { [signer.keyId]: signer.info().public_key };
    expect(verifyReceipt(b.receipt, keys)).toEqual({ valid: true });
    const v = await (await post('/v1/verify', { receipt: b.receipt, sha256: sha })).json() as any;
    expect(v).toMatchObject({ valid: true, moonmark: b.receipt.moonmark, key_id: signer.keyId });
  });

  it('rejects tampering', async () => {
    const b = await (await post('/v1/sign', { sha256: sha })).json() as any;
    const keys = { [signer.keyId]: signer.info().public_key };
    expect(verifyReceipt({ ...b.receipt, unix_ns: '1' }, keys).valid).toBe(false);
    expect(verifyReceipt({ ...b.receipt, sha256: 'a'.repeat(64) }, keys).reason).toBe('bad_signature');
    expect(verifyReceipt({ ...b.receipt, key_id: '0000000000000000' }, keys).reason).toBe('unknown_key');
    expect((await (await post('/v1/verify', { receipt: b.receipt, sha256: 'b'.repeat(64) })).json() as any).reason).toBe('content_mismatch');
  });

  it('catches a validly signed moonmark that does not match its unix_ns', async () => {
    const r = signer.sign(sha, '1928.01.01 00:00:00.000000000', 1_794_599_684_712_000_000n);
    expect((await (await post('/v1/verify', { receipt: r })).json() as any).reason).toBe('moonmark_mismatch');
  });

  it('accepts retired keys for old receipts', async () => {
    const old = new Signer(loadPrivateKey(der));
    const r = old.sign(sha, '1928.05.04 07:13:27.989285653', 0n);
    const fixed = old.sign(sha, (await (await get('/v1/convert?unix_ns=1794599684712000000')).json() as any).moonmark, 1_794_599_684_712_000_000n);
    const { privateKey: k2 } = generateKeyPairSync('ed25519');
    const e = { SIGNER: new Signer(k2), RETIRED_KEYS: { [old.keyId]: old.info().public_key } };
    expect((await (await post('/v1/verify', { receipt: fixed }, e)).json() as any).valid).toBe(true);
    expect(r.key_id).toBe(old.keyId);
  });

  it('validates input and methods', async () => {
    expect((await post('/v1/sign', { sha256: 'nope' })).status).toBe(400);
    expect((await post('/v1/sign', { content: 'x' })).status).toBe(400);
    expect((await post('/v1/sign', { sha256: sha }, {})).status).toBe(503);
    expect((await get('/v1/sign')).status).toBe(405);
    expect((await handle(new Request('https://api.moon369.org/v1/sign', { method: 'POST', body: 'not json' }), env)).status).toBe(400);
    expect((await handle(new Request('https://api.moon369.org/v1/now', { method: 'POST' }), env)).status).toBe(405);
  });

  it('signs exactly the documented bytes', () => {
    const r = signer.sign(sha, '1928.05.04 07:13:27.989285653', 1n);
    expect(signedBytes(r).toString()).toBe(['moonmark-receipt/1', 'sha256:' + sha, '1928.05.04 07:13:27.989285653', '1', signer.keyId].join('\n'));
  });
});
