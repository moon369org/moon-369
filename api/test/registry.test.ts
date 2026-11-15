import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, verify as edVerify } from 'node:crypto';
import { handle, type Env } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { envKeyStore, hashKey } from '../src/keys.js';
import { memoryRegistry, registrationBytes, hamming, type Registration } from '../src/registry.js';

const kp = generateKeyPairSync('ed25519');
const KEY = 'moon_testkey_halden';
const env = (): Env => ({
  SIGNER: new Signer(kp.privateKey),
  REGISTRY: memoryRegistry(),
  API_KEYS: envKeyStore(JSON.stringify({ [hashKey(KEY)]: { owner: 'Halden Stock', plan: 'pro' } })),
});
const post = (e: Env, path: string, body: unknown, key?: string) => handle(new Request('http://x' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body) }), e);
const get = (e: Env, path: string) => handle(new Request('http://x' + path), e);
const SHA = 'ab'.repeat(32), SHA2 = 'cd'.repeat(32);

describe('registry', () => {
  it('records who registered a file, verified by API key, and looks it up by fingerprint', async () => {
    const e = env();
    const r = await post(e, '/v1/sign', { sha256: SHA, on_behalf_of: 'Ana Ruiz', label: 'Harbor fog', phash: '0f0f0f0f0f0f0f0f' }, KEY);
    expect(r.status).toBe(200);
    const out = await r.json() as { registration: { registrant: string; registrant_verified: boolean } };
    expect(out.registration.registrant).toBe('Halden Stock');
    expect(out.registration.registrant_verified).toBe(true);
    const lk = await (await get(e, '/v1/lookup/' + SHA)).json() as { registered: boolean; count: number; first: { registrant: string; on_behalf_of: string; label: string; statement: Registration } };
    expect(lk.registered).toBe(true);
    expect(lk.first.on_behalf_of).toBe('Ana Ruiz');
    expect(lk.first.label).toBe('Harbor fog');
    // The registration statement is signed by Moon's key.
    const st = lk.first.statement;
    const { signature, signed_url, ...base } = st;
    expect(edVerify(null, Buffer.from(registrationBytes(base)), kp.publicKey, Buffer.from(signature.signature, 'base64url'))).toBe(true);
    const none = await (await get(e, '/v1/lookup/' + SHA2)).json() as { registered: boolean };
    expect(none.registered).toBe(false);
  });

  it('marks open-tier registrations as anonymous', async () => {
    const e = env();
    await post(e, '/v1/sign', { sha256: SHA, on_behalf_of: 'Someone' });
    const lk = await (await get(e, '/v1/lookup/' + SHA)).json() as { first: { registrant: string; registrant_verified: boolean } };
    expect(lk.first.registrant).toBe('anonymous');
    expect(lk.first.registrant_verified).toBe(false);
  });

  it('finds look-alike images by perceptual hash', async () => {
    const e = env();
    await post(e, '/v1/sign', { sha256: SHA, phash: 'ffff00000000ffff' }, KEY);
    await post(e, '/v1/sign', { sha256: SHA2, phash: '0123456789abcdef' }, KEY);
    const near = 'ffff00000000fff0';   // 4 bits off the first
    expect(hamming(near, 'ffff00000000ffff')).toBe(4);
    const sim = await (await post(e, '/v1/lookup/similar', { phash: near })).json() as { count: number; matches: { sha256: string; distance: number }[] };
    expect(sim.count).toBe(1);
    expect(sim.matches[0].sha256).toBe(SHA);
    expect(sim.matches[0].distance).toBe(4);
  });

  it('signs in batches with an API key only', async () => {
    const e = env();
    const items = [{ sha256: SHA, label: 'one' }, { sha256: SHA2, label: 'two' }];
    expect((await post(e, '/v1/sign/batch', { items })).status).toBe(403);
    const r = await post(e, '/v1/sign/batch', { items }, KEY);
    expect(r.status).toBe(200);
    const out = await r.json() as { count: number; results: { receipt: { sha256: string } }[] };
    expect(out.count).toBe(2);
    expect(out.results.map((x) => x.receipt.sha256)).toEqual([SHA, SHA2]);
    const lk = await (await get(e, '/v1/lookup/' + SHA2)).json() as { first: { label: string } };
    expect(lk.first.label).toBe('two');
  });
});
