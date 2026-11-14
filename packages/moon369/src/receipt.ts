/**
 * Verify signed Moonmark receipts. Pure Ed25519, no server needed when you pass the keys.
 * Works in browsers, Node 18+, Deno, Bun and edge runtimes.
 */
import { verifyAsync } from '@noble/ed25519';
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { toMoon, formatMoonmark } from './moon.js';

export const RECEIPT_V1 = 'moonmark-receipt/1';
export const RECEIPT_V2 = 'moonmark-receipt/2';
export const RECEIPT_V3 = 'moonmark-receipt/3';
export const RECEIPT_VERSION = RECEIPT_V3;
export const PQ_ALG = 'ML-DSA-65';

/** drand quicknet (League of Entropy): the public randomness beacon in v2 receipts. */
export const QUICKNET = {
  network: 'drand-quicknet',
  hash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
  public_key: '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
  period: 3,
  genesis_time: 1692803367,
} as const;
export interface BeaconChain { public_key: string; period: number; genesis_time: number }
export interface Beacon { network: 'drand-quicknet'; round: number; signature: string }
const SKEW_NS = 10_000_000_000n;

/** Unix nanoseconds when a drand round is first published. */
export const beaconRoundTime = (round: number, chain: BeaconChain = QUICKNET): bigint =>
  (BigInt(chain.genesis_time) + BigInt(round - 1) * BigInt(chain.period)) * 1_000_000_000n;

/** Check a drand round against the network's public key. Offline. */
export function verifyBeacon(b: { round: unknown; signature: unknown }, chain: BeaconChain = QUICKNET): boolean {
  if (!Number.isSafeInteger(b.round) || (b.round as number) < 1 || typeof b.signature !== 'string' || !/^[0-9a-f]{96}$/.test(b.signature)) return false;
  try {
    const msg = new Uint8Array(8);
    new DataView(msg.buffer).setBigUint64(0, BigInt(b.round as number));
    const ss = bls.shortSignatures;
    return ss.verify(ss.Signature.fromHex(b.signature), ss.hash(sha256(msg), 'BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_'), bls.G2.Point.fromHex(chain.public_key));
  } catch { return false; }
}
export const KEYS_URL = 'https://api.moon369.org/v1/keys';

export interface Receipt {
  receipt: typeof RECEIPT_V1 | typeof RECEIPT_V2 | typeof RECEIPT_V3;
  sha256: string;
  moonmark: string;
  unix_ns: string;
  key_id: string;
  beacon?: Beacon;
  /** v3: post-quantum signature (ML-DSA-65) over the same bytes. */
  pq?: { alg: typeof PQ_ALG; key_id: string; signature?: string };
  signature: string;
}

/** key_id -> base64url raw 32-byte Ed25519 public key */
export type KeySet = Record<string, string>;

export type VerifyResult =
  | { valid: true; moonmark: string; unix_ns: bigint; key_id: string; not_before?: { unix_ns: bigint; round: number }; post_quantum?: boolean }
  | { valid: false; reason: 'not_a_receipt' | 'unknown_version' | 'malformed' | 'unknown_key' | 'bad_signature' | 'bad_pq_signature' | 'bad_beacon' | 'beacon_after_moment' | 'moonmark_mismatch' | 'content_mismatch' };

const enc = new TextEncoder();
const HEX64 = /^[0-9a-f]{64}$/;

export function b64urlToBytes(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The exact bytes Moon signs: one field per line, fixed order. */
export const signedBytes = (r: Omit<Receipt, 'signature'>): Uint8Array =>
  enc.encode([r.receipt, 'sha256:' + r.sha256, r.moonmark, r.unix_ns, r.key_id,
    ...((r.receipt === RECEIPT_V2 || r.receipt === RECEIPT_V3) && r.beacon ? [`${r.beacon.network}:${r.beacon.round}:${r.beacon.signature}`] : []),
    ...(r.receipt === RECEIPT_V3 && r.pq ? [`ml-dsa-65:${r.pq.key_id}`] : [])].join('\n'));

/** SHA-256 of bytes or text, as lowercase hex. This is the fingerprint Moon signs. */
export async function fingerprint(data: ArrayBuffer | ArrayBufferView | Blob | string): Promise<string> {
  let buf: ArrayBuffer | ArrayBufferView;
  if (typeof data === 'string') buf = enc.encode(data);
  else if (typeof Blob !== 'undefined' && data instanceof Blob) buf = await data.arrayBuffer();
  else buf = data as ArrayBuffer | ArrayBufferView;
  const d = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Moon's public keys, active and retired. Cache them and you never need the network again. */
export async function fetchKeys(url = KEYS_URL): Promise<KeySet> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not fetch Moon keys (${r.status})`);
  const b = (await r.json()) as { keys: { key_id: string; public_key: string }[] };
  return Object.fromEntries(b.keys.map((k) => [k.key_id, k.public_key]));
}

export interface VerifyOptions {
  /** Known keys. Leave out to fetch them from Moon. */
  keys?: KeySet;
  /** Also check the receipt is for this content (its fingerprint, or the bytes themselves). */
  content?: ArrayBuffer | ArrayBufferView | Blob | string;
  /** Or check against a fingerprint you already have. */
  sha256?: string;
  /** Beacon network to check v2 receipts against. Default: drand quicknet. */
  beaconChain?: BeaconChain;
}

/** Check a signed Moonmark receipt. Offline when you pass keys. */
export async function verify(receipt: unknown, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const r = receipt as Partial<Receipt> | null;
  if (!r || typeof r !== 'object') return { valid: false, reason: 'not_a_receipt' };
  if (r.receipt !== RECEIPT_V1 && r.receipt !== RECEIPT_V2 && r.receipt !== RECEIPT_V3) return { valid: false, reason: 'unknown_version' };
  const b = r.beacon;
  const beaconOk = !!b && typeof b === 'object' && b.network === 'drand-quicknet' && Number.isSafeInteger(b.round) && typeof b.signature === 'string';
  if (r.receipt === RECEIPT_V2 && !beaconOk) return { valid: false, reason: 'malformed' };
  if (r.receipt === RECEIPT_V3 && ((b !== undefined && !beaconOk) || !r.pq || r.pq.alg !== PQ_ALG || typeof r.pq.key_id !== 'string' || (r.pq.signature !== undefined && typeof r.pq.signature !== 'string')))
    return { valid: false, reason: 'malformed' };
  if (typeof r.sha256 !== 'string' || !HEX64.test(r.sha256) || typeof r.moonmark !== 'string' || typeof r.unix_ns !== 'string' ||
      !/^-?\d+$/.test(r.unix_ns) || typeof r.key_id !== 'string' || typeof r.signature !== 'string')
    return { valid: false, reason: 'malformed' };
  const keys = opts.keys ?? (await fetchKeys());
  const pk = keys[r.key_id];
  if (!pk) return { valid: false, reason: 'unknown_key' };
  let ok = false;
  const body = { receipt: r.receipt, sha256: r.sha256, moonmark: r.moonmark, unix_ns: r.unix_ns, key_id: r.key_id,
    ...(r.receipt !== RECEIPT_V1 && b ? { beacon: b } : {}),
    ...(r.receipt === RECEIPT_V3 ? { pq: { alg: PQ_ALG, key_id: r.pq!.key_id } } : {}) } as Omit<Receipt, 'signature'>;
  try { ok = await verifyAsync(b64urlToBytes(r.signature), signedBytes(body), b64urlToBytes(pk)); } catch { ok = false; }
  if (!ok) return { valid: false, reason: 'bad_signature' };
  let post_quantum: boolean | undefined;
  if (r.receipt === RECEIPT_V3) {
    post_quantum = false;
    if (r.pq!.signature !== undefined) {
      const ppk = keys[r.pq!.key_id];
      if (!ppk) return { valid: false, reason: 'unknown_key' };
      let pqOk = false;
      try { pqOk = ml_dsa65.verify(b64urlToBytes(r.pq!.signature), signedBytes(body), b64urlToBytes(ppk)); } catch { pqOk = false; }
      if (!pqOk) return { valid: false, reason: 'bad_pq_signature' };
      post_quantum = true;
    }
  }
  const ns = BigInt(r.unix_ns);
  let not_before: { unix_ns: bigint; round: number } | undefined;
  if (body.beacon) {
    if (!verifyBeacon(body.beacon, opts.beaconChain)) return { valid: false, reason: 'bad_beacon' };
    const nb = beaconRoundTime(body.beacon.round, opts.beaconChain);
    if (ns + SKEW_NS < nb) return { valid: false, reason: 'beacon_after_moment' };
    not_before = { unix_ns: nb, round: body.beacon.round };
  }
  if (formatMoonmark(toMoon(ns)) !== r.moonmark) return { valid: false, reason: 'moonmark_mismatch' };
  const want = opts.sha256 !== undefined ? opts.sha256.toLowerCase() : opts.content !== undefined ? await fingerprint(opts.content) : undefined;
  if (want !== undefined && want !== r.sha256) return { valid: false, reason: 'content_mismatch' };
  return { valid: true, moonmark: r.moonmark, unix_ns: ns, key_id: r.key_id, ...(not_before ? { not_before } : {}), ...(post_quantum !== undefined ? { post_quantum } : {}) };
}
