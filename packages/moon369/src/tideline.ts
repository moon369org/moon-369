/**
 * The Tideline: Moon's public log. Every lune's signed Moonmarks are sealed into a tide
 * (a Merkle root, chained to the previous tide, signed by Moon and anchored on the XRP Ledger).
 * These checks run offline.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { verifyAsync } from '@noble/ed25519';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { signedBytes, b64urlToBytes, type Receipt, type KeySet } from './receipt.js';

const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const enc = new TextEncoder();

export interface Tide {
  tideline: 'tideline/1'; lune: string; lune_index: number; size: number; root: string; prev: string | null;
  ends_unix_ns: string; sealed_unix_ns: string; key_id: string; signature: string;
  pq?: { alg: 'ML-DSA-65'; key_id: string; signature: string };
  anchor?: { network: 'xrpl'; tx: string; ledger_index?: number; explorer: string } | null; hash: string;
}

/** A receipt's leaf hash in the Tideline (RFC 9162: SHA-256 of 0x00 + its signed bytes). */
export function receiptLeaf(r: Receipt): string {
  const { signature: _s, ...body } = r;
  return hexOf(sha256(cat(new Uint8Array([0]), signedBytes(body as Omit<Receipt, 'signature'>))));
}

/** Check a Merkle inclusion proof (RFC 9162, 2.1.3.2). */
export function verifyInclusion(leaf: string, index: number, size: number, path: string[], root: string): boolean {
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || index >= size) return false;
  const node = (l: Uint8Array, r: Uint8Array) => sha256(cat(new Uint8Array([1]), l, r));
  let fn = index, sn = size - 1, r = bytesOf(leaf);
  for (const p of path) {
    if (sn === 0) return false;
    const pb = bytesOf(p);
    if (fn % 2 === 1 || fn === sn) { r = node(pb, r); if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn >>= 1; sn >>= 1; } }
    else r = node(r, pb);
    fn >>= 1; sn >>= 1;
  }
  return sn === 0 && hexOf(r) === root;
}

export const tideBytes = (t: Tide): Uint8Array => enc.encode(['tideline/1', `lune:${t.lune}`, `index:${t.lune_index}`, `size:${t.size}`, `root:${t.root}`, `prev:${t.prev ?? 'none'}`, `ends:${t.ends_unix_ns}`, `sealed:${t.sealed_unix_ns}`].join('\n'));

/** Check a tide's hash and Moon's signatures on it (both, when it carries a post-quantum one). */
export async function verifyTide(t: Tide, keys: KeySet): Promise<boolean> {
  const bytes = tideBytes(t);
  if (hexOf(sha256(bytes)) !== t.hash) return false;
  const pk = keys[t.key_id]; if (!pk) return false;
  try { if (!(await verifyAsync(b64urlToBytes(t.signature), bytes, b64urlToBytes(pk)))) return false; } catch { return false; }
  if (!t.pq) return true;
  const ppk = keys[t.pq.key_id]; if (!ppk) return false;
  try { return ml_dsa65.verify(b64urlToBytes(t.pq.signature), bytes, b64urlToBytes(ppk)); } catch { return false; }
}
