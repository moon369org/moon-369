// Signed Moonmarks: a receipt that says "Moon saw this SHA-256 fingerprint at this exact moment".
// Anyone can verify a receipt offline with Moon's public keys.
//
// Versions (the method can change without breaking old receipts; every version stays verifiable):
//   moonmark-receipt/1  Ed25519
//   moonmark-receipt/2  Ed25519 + drand beacon (proves the receipt wasn't signed earlier)
//   moonmark-receipt/3  hybrid: Ed25519 AND ML-DSA-65 (post-quantum, FIPS 204) over the same bytes,
//                       beacon when available. A full v3 receipt needs both signatures to check out,
//                       so it can't be forged unless both algorithms are broken.
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { verifyBeacon, roundTimeNs, BEACON_NETWORK, QUICKNET, type Beacon, type Chain } from './beacon.js';

export const RECEIPT_V1 = 'moonmark-receipt/1';
export const RECEIPT_V2 = 'moonmark-receipt/2';
export const RECEIPT_V3 = 'moonmark-receipt/3';
export const RECEIPT_VERSIONS = [RECEIPT_V1, RECEIPT_V2, RECEIPT_V3] as const;
export const RECEIPT_VERSION = RECEIPT_V3;
export const PQ_ALG = 'ML-DSA-65';
/** How far Moon's clock may sit behind a beacon's nominal time and still count. */
export const BEACON_SKEW_NS = 10_000_000_000n;

export interface PqPart { alg: typeof PQ_ALG; key_id: string; signature?: string }

export interface Receipt {
  receipt: (typeof RECEIPT_VERSIONS)[number];
  sha256: string;      // lowercase hex fingerprint of the signed content
  moonmark: string;    // YEAR.MM.DD HH:MM:SS.NNNNNNNNN
  unix_ns: string;     // the same moment as Unix nanoseconds
  key_id: string;      // which Moon Ed25519 key signed it
  beacon?: Beacon;     // v2 (required), v3 (when available): the latest drand round Moon had seen
  pq?: PqPart;         // v3: the post-quantum signature
  signature: string;   // base64url Ed25519 signature over signedBytes(...)
}

export interface PublicKeyInfo { key_id: string; alg: 'Ed25519' | typeof PQ_ALG; public_key: string; status: 'active' | 'retired' }

const HEX64 = /^[0-9a-f]{64}$/;
export const isSha256Hex = (s: unknown): s is string => typeof s === 'string' && HEX64.test(s);

/**
 * The exact bytes that are signed. One field per line, fixed order:
 * receipt, "sha256:" + hex, moonmark, unix_ns, key_id,
 * then the beacon line "drand-quicknet:<round>:<signature>" (v2 always, v3 when present),
 * then for v3 "ml-dsa-65:<pq key_id>". Both v3 signatures sign these same bytes.
 */
export function signedBytes(r: Omit<Receipt, 'signature'>): Buffer {
  const lines = [r.receipt, 'sha256:' + r.sha256, r.moonmark, r.unix_ns, r.key_id];
  if (r.beacon && (r.receipt === RECEIPT_V2 || r.receipt === RECEIPT_V3)) lines.push(`${r.beacon.network}:${r.beacon.round}:${r.beacon.signature}`);
  if (r.receipt === RECEIPT_V3) lines.push(`ml-dsa-65:${r.pq!.key_id}`);
  return Buffer.from(lines.join('\n'), 'utf8');
}

const rawPublic = (k: KeyObject) => Buffer.from(k.export({ format: 'jwk' }).x as string, 'base64url');
const sha16 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16);

/** Key id: first 16 hex chars of SHA-256 over the raw public key (32 bytes Ed25519, 1952 bytes ML-DSA-65). */
export const keyIdOf = (pub: KeyObject) => sha16(rawPublic(pub));

/** Load a private key from env: PEM, or base64 of PKCS8 DER. */
export function loadPrivateKey(v: string): KeyObject {
  const s = v.trim();
  const k = s.includes('BEGIN') ? createPrivateKey(s) : createPrivateKey({ key: Buffer.from(s, 'base64'), format: 'der', type: 'pkcs8' });
  if (k.asymmetricKeyType !== 'ed25519') throw new Error('Signing key must be Ed25519');
  return k;
}

/** Load a public key from its raw 32 bytes, base64url (as published at /v1/keys). */
export function publicKeyFromRaw(b64url: string): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: b64url }, format: 'jwk' });
}

/** Post-quantum signer: ML-DSA-65 (FIPS 204), from a 32-byte seed (MOON_PQ_KEY, base64). */
export class PqSigner {
  readonly keyId: string; private readonly pub: Uint8Array; private readonly sec: Uint8Array;
  constructor(seed: Uint8Array) {
    if (seed.length !== 32) throw new Error('ML-DSA seed must be 32 bytes');
    const k = ml_dsa65.keygen(seed); this.pub = k.publicKey; this.sec = k.secretKey; this.keyId = sha16(this.pub);
  }
  static fromEnv(v: string) { return new PqSigner(new Uint8Array(Buffer.from(v.trim(), 'base64'))); }
  info(): PublicKeyInfo { return { key_id: this.keyId, alg: PQ_ALG, public_key: Buffer.from(this.pub).toString('base64url'), status: 'active' }; }
  sign(msg: Uint8Array): string { return Buffer.from(ml_dsa65.sign(msg, this.sec)).toString('base64url'); }
}

export class Signer {
  readonly pub: KeyObject; readonly keyId: string;
  constructor(private readonly priv: KeyObject, readonly pq?: PqSigner) { this.pub = createPublicKey(priv); this.keyId = keyIdOf(this.pub); }
  info(): PublicKeyInfo { return { key_id: this.keyId, alg: 'Ed25519', public_key: rawPublic(this.pub).toString('base64url'), status: 'active' }; }
  sign(sha256: string, moonmark: string, unixNs: bigint, beacon?: Beacon | null): Receipt {
    const base = { sha256, moonmark, unix_ns: unixNs.toString(), key_id: this.keyId };
    if (this.pq) {
      const body = { receipt: RECEIPT_V3, ...base, ...(beacon ? { beacon } : {}), pq: { alg: PQ_ALG, key_id: this.pq.keyId } } as Omit<Receipt, 'signature'>;
      const bytes = signedBytes(body);
      return { ...body, pq: { ...body.pq!, signature: this.pq.sign(bytes) }, signature: sign(null, bytes, this.priv).toString('base64url') };
    }
    const body = (beacon ? { receipt: RECEIPT_V2, ...base, beacon } : { receipt: RECEIPT_V1, ...base }) as Omit<Receipt, 'signature'>;
    return { ...body, signature: sign(null, signedBytes(body), this.priv).toString('base64url') };
  }
}

export type VerifyOut = {
  valid: boolean; reason?: string; not_before_unix_ns?: string; beacon_round?: number;
  /** v3: true when the post-quantum signature was present and checked. A v3 receipt without it (as in a short link) is checked with Ed25519 only. */
  post_quantum?: boolean;
};

/** Verify a receipt against known public keys (key_id -> base64url raw key; Ed25519 or ML-DSA-65). Pure and offline. */
export function verifyReceipt(r: unknown, keys: Record<string, string>, chain: Chain = QUICKNET): VerifyOut {
  const x = r as Partial<Receipt> | null;
  if (!x || typeof x !== 'object') return { valid: false, reason: 'not_a_receipt' };
  if (!RECEIPT_VERSIONS.includes(x.receipt as never)) return { valid: false, reason: 'unknown_version' };
  if (!isSha256Hex(x.sha256) || typeof x.moonmark !== 'string' || typeof x.unix_ns !== 'string' || !/^-?\d+$/.test(x.unix_ns) || typeof x.key_id !== 'string' || typeof x.signature !== 'string')
    return { valid: false, reason: 'malformed' };
  const b = x.beacon;
  const beaconOk = (v: unknown): v is Beacon => !!v && typeof v === 'object' && (v as Beacon).network === BEACON_NETWORK && Number.isSafeInteger((v as Beacon).round) && typeof (v as Beacon).signature === 'string';
  if (x.receipt === RECEIPT_V2 && !beaconOk(b)) return { valid: false, reason: 'malformed' };
  if (x.receipt === RECEIPT_V3) {
    if (b !== undefined && !beaconOk(b)) return { valid: false, reason: 'malformed' };
    if (!x.pq || x.pq.alg !== PQ_ALG || typeof x.pq.key_id !== 'string' || (x.pq.signature !== undefined && typeof x.pq.signature !== 'string')) return { valid: false, reason: 'malformed' };
  }
  const pk = keys[x.key_id];
  if (!pk) return { valid: false, reason: 'unknown_key' };
  const body = {
    receipt: x.receipt, sha256: x.sha256, moonmark: x.moonmark, unix_ns: x.unix_ns, key_id: x.key_id,
    ...(x.receipt !== RECEIPT_V1 && b ? { beacon: b } : {}),
    ...(x.receipt === RECEIPT_V3 ? { pq: { alg: PQ_ALG, key_id: x.pq!.key_id } } : {}),
  } as Omit<Receipt, 'signature'>;
  const bytes = signedBytes(body);
  try {
    if (!verify(null, bytes, publicKeyFromRaw(pk), Buffer.from(x.signature, 'base64url'))) return { valid: false, reason: 'bad_signature' };
  } catch { return { valid: false, reason: 'bad_signature' }; }
  let post_quantum: boolean | undefined;
  if (x.receipt === RECEIPT_V3) {
    post_quantum = false;
    if (x.pq!.signature !== undefined) {
      const ppk = keys[x.pq!.key_id];
      if (!ppk) return { valid: false, reason: 'unknown_key' };
      let ok = false;
      try { ok = ml_dsa65.verify(new Uint8Array(Buffer.from(x.pq!.signature, 'base64url')), new Uint8Array(bytes), new Uint8Array(Buffer.from(ppk, 'base64url'))); } catch { ok = false; }
      if (!ok) return { valid: false, reason: 'bad_pq_signature' };
      post_quantum = true;
    }
  }
  const pqOut = post_quantum === undefined ? {} : { post_quantum };
  if (!body.beacon) return { valid: true, ...pqOut };
  if (!verifyBeacon(body.beacon, chain)) return { valid: false, reason: 'bad_beacon' };
  const nb = roundTimeNs(body.beacon.round, chain);
  if (BigInt(x.unix_ns) + BEACON_SKEW_NS < nb) return { valid: false, reason: 'beacon_after_moment' };
  return { valid: true, not_before_unix_ns: nb.toString(), beacon_round: body.beacon.round, ...pqOut };
}
