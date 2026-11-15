import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, verify as nodeVerify, createPublicKey, X509Certificate } from 'node:crypto';
import { handle } from '../src/index.js';
import { TsaSigner, parseRequest, issue, TsaReject, FAIL, TSA_POLICY } from '../src/tsa.js';
import { read, kids, value, raw, readOid, readInt } from '../src/der.js';

// Test-only key and self-signed certificate. Not Moon's.
const fx = (f: string) => readFileSync(new URL('./fixtures/' + f, import.meta.url));
const signer = new TsaSigner(fx('tsa-test.key').toString(), fx('tsa-test.pem').toString());
const req256 = new Uint8Array(fx('tsa-req-sha256.tsq'));

function token(resp: Uint8Array) {
  const [status, tok] = kids(read(resp));
  expect(readInt(kids(status)[0])).toBe(0n);
  const sd = kids(kids(tok)[1])[0];
  const parts = kids(sd);
  const encap = parts[2], signerInfos = parts[parts.length - 1];
  const tstDer = value(kids(kids(encap)[1])[0]);
  const si = kids(kids(signerInfos)[0]);
  const signedAttrs = si[3], sig = value(si[5]);
  const asSet = new Uint8Array(raw(signedAttrs)); asSet[0] = 0x31;
  return { tstDer, signedAttrs, asSet, sig, hasCerts: parts.some((p) => p.tag === 0xa0) };
}

describe('RFC 3161 TSA', () => {
  it('parses an OpenSSL request', () => {
    const r = parseRequest(req256);
    expect(r.hashName).toBe('SHA-256');
    expect(r.digest.length).toBe(32);
    expect(r.certReq).toBe(true);
    expect(r.nonce).toBeDefined();
  });

  it('rejects SHA-1 and garbage', () => {
    expect(() => parseRequest(new Uint8Array(fx('tsa-req-sha1.tsq')))).toThrow(TsaReject);
    try { parseRequest(new Uint8Array(fx('tsa-req-sha1.tsq'))); } catch (e) { expect((e as TsaReject).fail).toBe(FAIL.badAlg); }
    try { parseRequest(new TextEncoder().encode('hello')); } catch (e) { expect((e as TsaReject).fail).toBe(FAIL.badDataFormat); }
  });

  it('issues a token whose signature and digest check out', () => {
    const r = parseRequest(req256);
    const ns = 1794711781861234567n;
    const resp = issue(signer, r, { unixNs: ns, serial: 42n, moonmarkUrl: 'https://moon369.org/m/x' });
    const t = token(resp);
    expect(t.hasCerts).toBe(true);
    const tst = kids(read(t.tstDer));
    expect(readOid(tst[1])).toBe(TSA_POLICY);
    expect(Buffer.from(raw(tst[2]))).toEqual(Buffer.from(r.imprint));
    expect(readInt(tst[3])).toBe(42n);
    expect(new TextDecoder().decode(value(tst[4]))).toBe('20261115030301.861234Z');
    expect(tst.some((x) => x.tag === 0x02 && Buffer.from(raw(x)).equals(Buffer.from(r.nonce!)))).toBe(true);
    // messageDigest attribute = SHA-256(TSTInfo)
    const md = createHash('sha256').update(t.tstDer).digest();
    expect(Buffer.from(t.asSet).includes(md)).toBe(true);
    // ECDSA signature over the signed attributes, with the certificate's key
    const pub = createPublicKey(new X509Certificate(fx('tsa-test.pem')).publicKey.export({ type: 'spki', format: 'pem' }));
    expect(nodeVerify('sha256', t.asSet, pub, t.sig)).toBe(true);
  });

  it('serves over HTTP and links a Moonmark', async () => {
    const res = await handle(new Request('http://x/v1/tsa', { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: req256 }), { TSA: signer });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/timestamp-reply');
    token(new Uint8Array(await res.arrayBuffer()));
    const info = await (await handle(new Request('http://x/v1/tsa'), { TSA: signer })).json() as { status: string };
    expect(info.status).toBe('enabled');
  });

  it('answers a rejection when not configured', async () => {
    const res = await handle(new Request('http://x/v1/tsa', { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: req256 }), {});
    const [status] = kids(read(new Uint8Array(await res.arrayBuffer())));
    expect(readInt(kids(status)[0])).toBe(2n);
  });
});
