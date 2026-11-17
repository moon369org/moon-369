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

/** Merkle root (RFC 9162) of a list of leaf hashes. Empty list: SHA-256 of nothing. */
export function merkleRoot(leaves: string[]): string {
  const node = (l: Uint8Array, r: Uint8Array) => sha256(cat(new Uint8Array([1]), l, r));
  const rootOf = (a: Uint8Array[]): Uint8Array => {
    if (a.length === 0) return sha256(new Uint8Array(0));
    if (a.length === 1) return a[0];
    let k = 1; while (k * 2 < a.length) k *= 2;
    return node(rootOf(a.slice(0, k)), rootOf(a.slice(k)));
  };
  return hexOf(rootOf(leaves.map(bytesOf)));
}

export interface AuditTide { lune: string; status: 'sealed' | 'pending' | 'missing'; size: number; ok: boolean; problems: string[]; bitcoin: string | null; tide?: Tide & { entries?: { index: number; leaf: string }[] } }
export interface AuditReport { ok: boolean; checked: number; sealed: number; receipts: number; head: string | null; tides: AuditTide[]; problems: string[] }

/**
 * Audit the whole Tideline from scratch, trusting nothing but Moon's public keys:
 * every finished lune must have a sealed tide whose entries hash to its root, whose hash and signatures
 * check out, and which chains to the tide before it. Runs anywhere `fetch` does.
 */
export async function auditTideline(opts: { api?: string; keys: KeySet; from?: string; onTide?: (t: AuditTide) => void; fetch?: typeof fetch }): Promise<AuditReport> {
  const api = (opts.api ?? 'https://api.moon369.org').replace(/\/$/, ''), f = opts.fetch ?? fetch;
  const get = async (p: string) => { const r = await f(api + p); if (!r.ok && r.status !== 404) throw new Error(`${p}: ${r.status}`); return r.status === 404 ? null : r.json(); };
  const stats = await get('/v1/stats') as { open_lune: string; history: { lune: string; receipts: number; ends_utc: string }[] };
  const now = Date.now(), out: AuditTide[] = [], problems: string[] = [];
  let prev: string | null = null, havePrev = false, started = !opts.from, receipts = 0, head: string | null = null;
  for (const h of stats.history) {
    if (!started && h.lune === opts.from) started = true;
    if (!started) continue;
    if (Date.parse(h.ends_utc) > now) break;                       // the open lune isn't sealed yet
    const b = await get('/v1/tideline/' + h.lune) as (Tide & { status: string; entries?: { index: number; leaf: string }[]; entries_truncated?: boolean; bitcoin?: { status: string } | null }) | null;
    const a: AuditTide = { lune: h.lune, status: !b ? 'missing' : b.status === 'sealed' ? 'sealed' : 'pending', size: b?.size ?? h.receipts, ok: true, problems: [], bitcoin: b?.bitcoin?.status ?? null };
    const bad = (m: string) => { a.ok = false; a.problems.push(m); };
    if (a.status === 'sealed' && b) {
      a.tide = b;
      if (!(await verifyTide(b, opts.keys))) bad('hash or signature does not check out');
      if (havePrev && b.prev !== prev) bad(`does not chain to the tide before it (expected ${prev?.slice(0, 12)}, got ${b.prev?.slice(0, 12)})`);
      if (!havePrev && !opts.from && b.prev !== null) bad('the first tide should chain to nothing');
      if (b.entries && !b.entries_truncated) {
        if (b.entries.length !== b.size) bad(`lists ${b.entries.length} entries but says ${b.size}`);
        else if (merkleRoot(b.entries.map((e) => e.leaf)) !== b.root) bad('its entries do not hash to its root');
      }
      if (b.size !== h.receipts) bad(`the log holds ${h.receipts} receipts but the tide sealed ${b.size}`);
      prev = b.hash; havePrev = true; head = b.lune; receipts += b.size;
    } else if (a.status === 'pending') {
      // Sealing runs within minutes of a lune ending; only flag it once it is clearly late.
      if (now - Date.parse(h.ends_utc) > 6 * 3600_000) bad('ended over 6 hours ago and is still not sealed');
    } else bad('no tide found');
    if (!a.ok) problems.push(`${a.lune}: ${a.problems.join('; ')}`);
    out.push(a); opts.onTide?.(a);
  }
  const sealed = out.filter((t) => t.status === 'sealed').length;
  return { ok: problems.length === 0, checked: out.length, sealed, receipts, head, tides: out, problems };
}
