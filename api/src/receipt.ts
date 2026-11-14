// Signed Moonmarks: a receipt that says "Moon saw this SHA-256 fingerprint at this exact moment".
// Ed25519 signatures. Anyone can verify a receipt offline with Moon's public key.
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

import { verifyBeacon, roundTimeNs, BEACON_NETWORK, QUICKNET, type Beacon, type Chain } from './beacon.js';

/** v1: fingerprint + moment. v2 adds a drand beacon, proving the receipt was signed after that round. */
export const RECEIPT_V1 = 'moonmark-receipt/1';
export const RECEIPT_V2 = 'moonmark-receipt/2';
export const RECEIPT_VERSION = RECEIPT_V2;
/** How far Moon's clock may sit behind a beacon's nominal time and still count. */
export const BEACON_SKEW_NS = 10_000_000_000n;

export interface Receipt {
  receipt: typeof RECEIPT_V1 | typeof RECEIPT_V2;
  sha256: string;      // lowercase hex fingerprint of the signed content
  moonmark: string;    // YEAR.MM.DD HH:MM:SS.NNNNNNNNN
  unix_ns: string;     // the same moment as Unix nanoseconds
  key_id: string;      // which Moon key signed it
  beacon?: Beacon;     // v2: the latest drand round Moon had seen when it signed
  signature: string;   // base64url Ed25519 signature over signedBytes(...)
}

export interface PublicKeyInfo { key_id: string; alg: 'Ed25519'; public_key: string; status: 'active' | 'retired' }

const HEX64 = /^[0-9a-f]{64}$/;
export const isSha256Hex = (s: unknown): s is string => typeof s === 'string' && HEX64.test(s);

/** The exact bytes that are signed. One field per line, fixed order. */
export function signedBytes(r: Omit<Receipt, 'signature'>): Buffer {
  const lines = [r.receipt, 'sha256:' + r.sha256, r.moonmark, r.unix_ns, r.key_id];
  if (r.receipt === RECEIPT_V2) lines.push(`${r.beacon!.network}:${r.beacon!.round}:${r.beacon!.signature}`);
  return Buffer.from(lines.join('\n'), 'utf8');
}

const rawPublic = (k: KeyObject) => Buffer.from(k.export({ format: 'jwk' }).x as string, 'base64url');

/** Key id: first 16 hex chars of SHA-256 over the raw 32-byte public key. */
export const keyIdOf = (pub: KeyObject) => createHash('sha256').update(rawPublic(pub)).digest('hex').slice(0, 16);

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

export class Signer {
  readonly pub: KeyObject; readonly keyId: string;
  constructor(private readonly priv: KeyObject) { this.pub = createPublicKey(priv); this.keyId = keyIdOf(this.pub); }
  info(): PublicKeyInfo { return { key_id: this.keyId, alg: 'Ed25519', public_key: rawPublic(this.pub).toString('base64url'), status: 'active' }; }
  sign(sha256: string, moonmark: string, unixNs: bigint, beacon?: Beacon | null): Receipt {
    const body = beacon
      ? { receipt: RECEIPT_V2, sha256, moonmark, unix_ns: unixNs.toString(), key_id: this.keyId, beacon } as const
      : { receipt: RECEIPT_V1, sha256, moonmark, unix_ns: unixNs.toString(), key_id: this.keyId } as const;
    return { ...body, signature: sign(null, signedBytes(body), this.priv).toString('base64url') };
  }
}

export type VerifyOut = { valid: boolean; reason?: string; not_before_unix_ns?: string; beacon_round?: number };

/** Verify a receipt against known public keys (key_id -> base64url raw key). Pure and offline. */
export function verifyReceipt(r: unknown, keys: Record<string, string>, chain: Chain = QUICKNET): VerifyOut {
  const x = r as Partial<Receipt> | null;
  if (!x || typeof x !== 'object') return { valid: false, reason: 'not_a_receipt' };
  if (x.receipt !== RECEIPT_V1 && x.receipt !== RECEIPT_V2) return { valid: false, reason: 'unknown_version' };
  if (!isSha256Hex(x.sha256) || typeof x.moonmark !== 'string' || typeof x.unix_ns !== 'string' || !/^-?\d+$/.test(x.unix_ns) || typeof x.key_id !== 'string' || typeof x.signature !== 'string')
    return { valid: false, reason: 'malformed' };
  const b = x.beacon;
  if (x.receipt === RECEIPT_V2 && (!b || typeof b !== 'object' || b.network !== BEACON_NETWORK || !Number.isSafeInteger(b.round) || typeof b.signature !== 'string'))
    return { valid: false, reason: 'malformed' };
  const pk = keys[x.key_id];
  if (!pk) return { valid: false, reason: 'unknown_key' };
  try {
    const body = { receipt: x.receipt, sha256: x.sha256, moonmark: x.moonmark, unix_ns: x.unix_ns, key_id: x.key_id, ...(x.receipt === RECEIPT_V2 ? { beacon: b } : {}) } as Omit<Receipt, 'signature'>;
    if (!verify(null, signedBytes(body), publicKeyFromRaw(pk), Buffer.from(x.signature, 'base64url'))) return { valid: false, reason: 'bad_signature' };
  } catch { return { valid: false, reason: 'bad_signature' }; }
  if (x.receipt === RECEIPT_V1) return { valid: true };
  if (!verifyBeacon(b!, chain)) return { valid: false, reason: 'bad_beacon' };
  const nb = roundTimeNs(b!.round, chain);
  if (BigInt(x.unix_ns) + BEACON_SKEW_NS < nb) return { valid: false, reason: 'beacon_after_moment' };
  return { valid: true, not_before_unix_ns: nb.toString(), beacon_round: b!.round };
}
