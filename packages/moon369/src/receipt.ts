/**
 * Verify signed Moonmark receipts. Pure Ed25519, no server needed when you pass the keys.
 * Works in browsers, Node 18+, Deno, Bun and edge runtimes.
 */
import { verifyAsync } from '@noble/ed25519';
import { toMoon, formatMoonmark } from './moon.js';

export const RECEIPT_VERSION = 'moonmark-receipt/1';
export const KEYS_URL = 'https://api.moon369.org/v1/keys';

export interface Receipt {
  receipt: typeof RECEIPT_VERSION;
  sha256: string;
  moonmark: string;
  unix_ns: string;
  key_id: string;
  signature: string;
}

/** key_id -> base64url raw 32-byte Ed25519 public key */
export type KeySet = Record<string, string>;

export type VerifyResult =
  | { valid: true; moonmark: string; unix_ns: bigint; key_id: string }
  | { valid: false; reason: 'not_a_receipt' | 'unknown_version' | 'malformed' | 'unknown_key' | 'bad_signature' | 'moonmark_mismatch' | 'content_mismatch' };

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
  enc.encode([r.receipt, 'sha256:' + r.sha256, r.moonmark, r.unix_ns, r.key_id].join('\n'));

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
}

/** Check a signed Moonmark receipt. Offline when you pass keys. */
export async function verify(receipt: unknown, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const r = receipt as Partial<Receipt> | null;
  if (!r || typeof r !== 'object') return { valid: false, reason: 'not_a_receipt' };
  if (r.receipt !== RECEIPT_VERSION) return { valid: false, reason: 'unknown_version' };
  if (typeof r.sha256 !== 'string' || !HEX64.test(r.sha256) || typeof r.moonmark !== 'string' || typeof r.unix_ns !== 'string' ||
      !/^-?\d+$/.test(r.unix_ns) || typeof r.key_id !== 'string' || typeof r.signature !== 'string')
    return { valid: false, reason: 'malformed' };
  const keys = opts.keys ?? (await fetchKeys());
  const pk = keys[r.key_id];
  if (!pk) return { valid: false, reason: 'unknown_key' };
  let ok = false;
  try { ok = await verifyAsync(b64urlToBytes(r.signature), signedBytes(r as Receipt), b64urlToBytes(pk)); } catch { ok = false; }
  if (!ok) return { valid: false, reason: 'bad_signature' };
  const ns = BigInt(r.unix_ns);
  if (formatMoonmark(toMoon(ns)) !== r.moonmark) return { valid: false, reason: 'moonmark_mismatch' };
  const want = opts.sha256 !== undefined ? opts.sha256.toLowerCase() : opts.content !== undefined ? await fingerprint(opts.content) : undefined;
  if (want !== undefined && want !== r.sha256) return { valid: false, reason: 'content_mismatch' };
  return { valid: true, moonmark: r.moonmark, unix_ns: ns, key_id: r.key_id };
}
