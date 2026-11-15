// RFC 3161 Time-Stamp Authority. Speaks the standard protocol cameras, C2PA tools, code
// signing and PDF signers already use, so any of them can timestamp with Moon unchanged.
//
// Request:  POST, Content-Type: application/timestamp-query  (DER TimeStampReq)
// Response: Content-Type: application/timestamp-reply         (DER TimeStampResp)
// The token is a CMS SignedData over TSTInfo, signed with ECDSA P-256 by the Moon
// Timestamp Authority certificate (issued by the Moon Root CA). For SHA-256 requests,
// Moon also issues its own signed Moonmark (Ed25519 + ML-DSA-65) for the same moment,
// logs it on the Tideline, and links it from a TSTInfo extension.
import { createHash, sign as nodeSign, createPrivateKey, type KeyObject } from 'node:crypto';
import { seq, setOf, set, octet, utf8, ctx, ctxPrim, int, oid, gtime, bits, tlv, read, kids, value, raw, readOid, type Bytes, type Node } from './der.js';

/** Moon's TSA policy: a UUID-based OID (ITU-T X.667), so it needs no registry. */
export const TSA_POLICY = '2.25.97540795833487867647412697343495905567';
/** Non-critical TSTInfo extension carrying the linked signed Moonmark URL (UTF8String). */
export const TSA_EXT_MOONMARK = TSA_POLICY + '.1';

const OID = {
  sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3',
  signedData: '1.2.840.113549.1.7.2', tstInfo: '1.2.840.113549.1.9.16.1.4',
  contentType: '1.2.840.113549.1.9.3', messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5',
  signingCertV2: '1.2.840.113549.1.9.16.2.47', ecdsaSha256: '1.2.840.10045.4.3.2',
};
export const HASHES: Record<string, { name: string; len: number }> = {
  [OID.sha256]: { name: 'SHA-256', len: 32 }, [OID.sha384]: { name: 'SHA-384', len: 48 }, [OID.sha512]: { name: 'SHA-512', len: 64 },
};

/** PKIFailureInfo bits (RFC 3161 section 2.4.2). */
export const FAIL = { badAlg: 0, badRequest: 2, badDataFormat: 5, timeNotAvailable: 14, unacceptedPolicy: 15, unacceptedExtension: 16, systemFailure: 25 } as const;

export class TsaReject extends Error { constructor(public fail: number, message: string) { super(message); } }

export interface TsaRequest { hashOid: string; hashName: string; digest: Bytes; imprint: Bytes; nonce?: Bytes; certReq: boolean }

export function parseRequest(der: Bytes): TsaRequest {
  let top: Node, f: Node[];
  try { top = read(der, 0); if (top.tag !== 0x30 || top.end !== der.length) throw 0; f = kids(top); }
  catch { throw new TsaReject(FAIL.badDataFormat, 'Not a DER TimeStampReq'); }
  try {
    if (f[0]?.tag !== 0x02 || value(f[0]).length !== 1 || value(f[0])[0] !== 1) throw new TsaReject(FAIL.badRequest, 'Unsupported TimeStampReq version');
    const mi = f[1]; if (mi?.tag !== 0x30) throw new TsaReject(FAIL.badDataFormat, 'Missing messageImprint');
    const [alg, hashed] = kids(mi);
    const hashOid = readOid(kids(alg)[0]);
    const h = HASHES[hashOid];
    if (!h) throw new TsaReject(FAIL.badAlg, 'Unsupported hash algorithm. Use SHA-256, SHA-384 or SHA-512');
    if (hashed.tag !== 0x04 || hashed.len !== h.len) throw new TsaReject(FAIL.badDataFormat, `messageImprint must be a ${h.name} digest`);
    let nonce: Bytes | undefined, certReq = false;
    for (const x of f.slice(2)) {
      if (x.tag === 0x06) { if (readOid(x) !== TSA_POLICY) throw new TsaReject(FAIL.unacceptedPolicy, 'Unknown policy. Omit reqPolicy or use ' + TSA_POLICY); }
      else if (x.tag === 0x02) nonce = raw(x);
      else if (x.tag === 0x01) certReq = value(x)[0] !== 0;
      else if (x.tag === 0xa0) throw new TsaReject(FAIL.unacceptedExtension, 'Request extensions are not supported');
      else throw new TsaReject(FAIL.badDataFormat, 'Unexpected field in TimeStampReq');
    }
    return { hashOid, hashName: h.name, digest: value(hashed), imprint: raw(mi), nonce, certReq };
  } catch (e) {
    if (e instanceof TsaReject) throw e;
    throw new TsaReject(FAIL.badDataFormat, 'Malformed TimeStampReq');
  }
}

const pemToDer = (pem: string): Bytes[] =>
  [...pem.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)].map((m) => new Uint8Array(Buffer.from(m[1].replace(/\s+/g, ''), 'base64')));

/** The TSA's key and certificate chain (leaf first). */
export class TsaSigner {
  readonly leaf: Bytes; readonly chain: Bytes[]; readonly issuer: Bytes; readonly serial: Bytes; readonly certHash: Bytes;
  private key: KeyObject;
  constructor(keyPem: string, chainPem: string) {
    this.key = createPrivateKey(keyPem.includes('BEGIN') ? keyPem : Buffer.from(keyPem, 'base64').toString('utf8'));
    if (this.key.asymmetricKeyType !== 'ec') throw new Error('MOON_TSA_KEY must be an EC P-256 key');
    this.chain = pemToDer(chainPem);
    if (!this.chain.length) throw new Error('No TSA certificate');
    this.leaf = this.chain[0];
    const tbs = kids(kids(read(this.leaf))[0]);
    const off = tbs[0].tag === 0xa0 ? 1 : 0;           // [0] version
    this.serial = raw(tbs[off]); this.issuer = raw(tbs[off + 2]);
    this.certHash = new Uint8Array(createHash('sha256').update(this.leaf).digest());
  }
  sign(data: Bytes): Bytes { return new Uint8Array(nodeSign('sha256', data, this.key)); }
  pem(): string { return this.chain.map((c) => '-----BEGIN CERTIFICATE-----\n' + Buffer.from(c).toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n?$/, '\n') + '-----END CERTIFICATE-----\n').join(''); }
}

const algId = (o: string) => seq(oid(o));
const attr = (o: string, v: Bytes) => seq(oid(o), set(v));

export interface IssueOptions { unixNs: bigint; serial: bigint; accuracyMs?: number; moonmarkUrl?: string }

/** Builds a granted TimeStampResp for a parsed request. */
export function issue(signer: TsaSigner, req: TsaRequest, o: IssueOptions): Bytes {
  const acc = Math.max(1, Math.min(999, Math.round(o.accuracyMs ?? 1)));
  const tst = seq(
    int(1),
    oid(TSA_POLICY),
    req.imprint,
    int(o.serial),
    gtime(o.unixNs),
    seq(ctxPrim(0, int(acc).subarray(2))),          // Accuracy { millis [0] }
    ...(req.nonce ? [req.nonce] : []),
    ...(o.moonmarkUrl ? [ctx(1, seq(oid(TSA_EXT_MOONMARK), octet(utf8(o.moonmarkUrl))))] : []),
  );
  const essCertIdV2 = seq(
    octet(signer.certHash),
    seq(seq(ctx(4, signer.issuer)), signer.serial),   // issuerSerial { GeneralNames { directoryName [4] }, serial }
  );
  const attrs = [
    attr(OID.contentType, oid(OID.tstInfo)),
    attr(OID.signingTime, utcTime(o.unixNs)),            // UTCTime until 2050, as RFC 5652 requires
    attr(OID.messageDigest, octet(new Uint8Array(createHash('sha256').update(tst).digest()))),
    attr(OID.signingCertV2, seq(seq(essCertIdV2))),
  ];
  const signedSet = setOf(...attrs);                    // signature covers the SET OF encoding
  const signature = signer.sign(signedSet);
  const signerInfo = seq(
    int(1),
    seq(signer.issuer, signer.serial),
    algId(OID.sha256),
    tlv(0xa0, signedSet.subarray(hdrLen(signedSet))),  // [0] IMPLICIT, same content
    algId(OID.ecdsaSha256),
    octet(signature),
  );
  const signedData = seq(
    int(3),
    set(algId(OID.sha256)),
    seq(oid(OID.tstInfo), ctx(0, octet(tst))),
    ...(req.certReq ? [tlv(0xa0, ...signer.chain.slice(0, 1))] : []),
    set(signerInfo),
  );
  const token = seq(oid(OID.signedData), ctx(0, signedData));
  return seq(seq(int(0)), token);
}

/** A rejection TimeStampResp. */
export function reject(fail: number, message: string): Bytes {
  return seq(seq(int(2), seq(utf8(message)), bits(fail)));
}

function hdrLen(der: Bytes): number { return read(der, 0).hdr; }

function utcTime(unixNs: bigint): Bytes {
  const d = new Date(Number(unixNs / 1_000_000n)), p = (n: number) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  if (y >= 2050) return gtime(unixNs, 0);
  return tlv(0x17, new TextEncoder().encode(`${p(y % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`));
}

