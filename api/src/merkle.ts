/**
 * Merkle trees in the Certificate Transparency style (RFC 9162, section 2.1).
 * leaf = SHA-256(0x00 || data), node = SHA-256(0x01 || left || right).
 * Inclusion proofs let anyone check one receipt is in a sealed lune with a few hashes.
 */
import { createHash } from 'node:crypto';

const h = (...parts: Uint8Array[]) => { const x = createHash('sha256'); for (const p of parts) x.update(p); return new Uint8Array(x.digest()); };
const LEAF = new Uint8Array([0]), NODE = new Uint8Array([1]);
export const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');
export const fromHex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));

export const leafHash = (data: Uint8Array): string => toHex(h(LEAF, data));
const node = (l: Uint8Array, r: Uint8Array) => h(NODE, l, r);
/** Largest power of two smaller than n (n > 1). */
const split = (n: number) => { let k = 1; while (k * 2 < n) k *= 2; return k; };

function rootOf(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return h();
  if (leaves.length === 1) return leaves[0];
  const k = split(leaves.length);
  return node(rootOf(leaves.slice(0, k)), rootOf(leaves.slice(k)));
}
/** Root of a list of leaf hashes (hex). Empty list: SHA-256 of nothing. */
export const merkleRoot = (leafHashes: string[]): string => toHex(rootOf(leafHashes.map(fromHex)));

function pathOf(i: number, leaves: Uint8Array[]): Uint8Array[] {
  if (leaves.length <= 1) return [];
  const k = split(leaves.length);
  return i < k
    ? [...pathOf(i, leaves.slice(0, k)), rootOf(leaves.slice(k))]
    : [...pathOf(i - k, leaves.slice(k)), rootOf(leaves.slice(0, k))];
}
/** Inclusion proof (audit path) for leaf i, bottom-up. */
export const inclusionProof = (i: number, leafHashes: string[]): string[] => pathOf(i, leafHashes.map(fromHex)).map(toHex);

/** Check an inclusion proof (RFC 9162, 2.1.3.2). */
export function verifyInclusion(leaf: string, index: number, size: number, path: string[], root: string): boolean {
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || index >= size) return false;
  let fn = index, sn = size - 1, r = fromHex(leaf);
  for (const p of path) {
    if (sn === 0) return false;
    const pb = fromHex(p);
    if (fn % 2 === 1 || fn === sn) {
      r = node(pb, r);
      if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn >>= 1; sn >>= 1; }
    } else r = node(r, pb);
    fn >>= 1; sn >>= 1;
  }
  return sn === 0 && toHex(r) === root;
}
