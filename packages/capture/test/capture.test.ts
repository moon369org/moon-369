import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, createHash } from 'node:crypto';
// A real Moon API, in memory: signing, registry, Tideline and the RFC 3161 TSA.
import { handle } from '../../../api/src/index.js';
import { Signer } from '../../../api/src/receipt.js';
import { memoryRegistry } from '../../../api/src/registry.js';
import { memoryStore } from '../../../api/src/tideline.js';
import { envKeyStore, hashKey } from '../../../api/src/keys.js';
import { TsaSigner } from '../../../api/src/tsa.js';
import { capture, verify, lookAlikeHash, SOURCE, MOON_ASSERTION } from '../src/index.js';

const fx = (f: string) => readFileSync(new URL('./fixtures/' + f, import.meta.url));
const apiFx = (f: string) => readFileSync(new URL('../../../api/test/fixtures/' + f, import.meta.url)).toString();
const KEY = 'moon_test_camera_app';
const env = {
  SIGNER: new Signer(generateKeyPairSync('ed25519').privateKey), REGISTRY: memoryRegistry(), TIDES: memoryStore(),
  API_KEYS: envKeyStore(JSON.stringify({ [hashKey(KEY)]: { owner: 'Test Camera Co', plan: 'business' } })),
  TSA: new TsaSigner(apiFx('tsa-test.key'), apiFx('tsa-test.pem')),
} as any;
let server: Server, api = '';
const signer = { certChainPem: fx('test-chain.pem'), privateKeyPem: fx('test-key.pem'), alg: 'es256' as const };
const photo = fx('photo.jpg');

beforeAll(async () => {
  server = createServer(async (q, s) => {
    const chunks: Buffer[] = []; for await (const c of q) chunks.push(c as Buffer);
    const r = await handle(new Request('http://x' + q.url, { method: q.method, headers: q.headers as any, body: ['GET', 'HEAD'].includes(q.method!) ? undefined : Buffer.concat(chunks) }), env);
    s.writeHead(r.status, Object.fromEntries(r.headers)); s.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  api = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
});
afterAll(() => server.close());

describe('capture', () => {
  it('signs at capture: a Moonmark inside C2PA credentials, timestamped by Moon', async () => {
    const out = await capture(photo, { mimeType: 'image/jpeg', signer, moonKey: KEY, api, label: 'IMG_0042.jpg', app: { name: 'Test Camera', version: '1.0' }, phash: 'f0f0f0f0f0f0f0f0' });
    expect(out.sha256).toBe(createHash('sha256').update(photo).digest('hex'));
    expect(out.bytes.length).toBeGreaterThan(photo.length);
    expect(out.registration).toMatchObject({ registrant: 'Test Camera Co', registrant_verified: true });

    const v = await verify(out.bytes, { mimeType: 'image/jpeg', api, tsaName: /^Test TSA/ });
    expect(v.hasCredentials).toBe(true);
    expect(v.credentials).toMatchObject({ valid: true, trusted: false, app: 'Test Camera', sourceType: SOURCE.capture, signedBy: 'Test Camera App' });
    expect(v.moon).toMatchObject({ timestamped: true, receiptValid: true, moonmark: out.moonmark, registeredBy: { name: 'Test Camera Co', verified: true } });
    expect(v.summary).toMatch(/a camera capture from Test Camera/);
    expect(v.summary).toMatch(/registered by Test Camera Co \(verified\)/);
    expect(v.summary).toMatch(/Timestamped by Moon/);
  });

  it('catches a file changed after signing', async () => {
    const out = await capture(photo, { mimeType: 'image/jpeg', signer, moonKey: KEY, api });
    const bad = Buffer.from(out.bytes); bad[bad.length - 200] ^= 0xff;   // one byte of the picture
    const v = await verify(bad, { mimeType: 'image/jpeg', api });
    expect(v.credentials!.valid).toBe(false);
    expect(v.summary).toMatch(/do not check out/);
  });

  it('keeps the capture findable even if the credentials are stripped', async () => {
    const out = await capture(photo, { mimeType: 'image/jpeg', signer, moonKey: KEY, api });
    expect((await verify(photo, { mimeType: 'image/jpeg', api })).hasCredentials).toBe(false);
    const lk = await (await fetch(api + '/v1/lookup/' + out.sha256)).json() as { registered: boolean; first: { registrant: string } };
    expect(lk.registered).toBe(true); expect(lk.first.registrant).toBe('Test Camera Co');
  });

  it('records generated media honestly, and works without a Moon key', async () => {
    const out = await capture(fx('photo2.jpg'), { mimeType: 'image/jpeg', signer, api, sourceType: SOURCE.ai });
    const v = await verify(out.bytes, { mimeType: 'image/jpeg', api });
    expect(v.credentials!.sourceType).toBe(SOURCE.ai);
    expect(v.moon!.registeredBy).toEqual({ name: 'anonymous', verified: false });
    expect(v.summary).toMatch(/AI-generated/);
  });

  it('carries the receipt in the Moon assertion', async () => {
    const { Reader } = await import('@contentauth/c2pa-node');
    const out = await capture(photo, { mimeType: 'image/jpeg', signer, moonKey: KEY, api });
    const j = (await Reader.fromAsset({ buffer: out.bytes, mimeType: 'image/jpeg' }))!.json() as any;
    const a = j.manifests[j.active_manifest].assertions.find((x: { label: string }) => x.label === MOON_ASSERTION).data;
    expect(a).toMatchObject({ spec: 'moon-capture/1', moonmark: out.moonmark, captured: { sha256: out.sha256 } });
    expect(a.receipt.sha256).toBe(out.sha256);
  });

  it('computes the same look-alike hash as moon369.org/check does in the browser', async () => {
    // 554d0f170f4c3355: what /embed/moon.js computes for this photo in Chrome.
    expect(await lookAlikeHash(photo)).toBe('554d0f170f4c3355');
    const out = await capture(photo, { mimeType: 'image/jpeg', signer, moonKey: KEY, api });
    expect(out.phash).toBe('554d0f170f4c3355');
  });
});
