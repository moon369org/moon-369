/**
 * The Tideline: Moon's public, append-only log of signed Moonmarks.
 *
 * Every receipt Moon signs is added to its lune's list. When a lune ends, Moon seals it into a
 * "tide": the Merkle root of every receipt in that lune, chained to the previous tide, signed
 * with Moon's keys (Ed25519 + ML-DSA-65) and anchored on the XRP Ledger. Anyone can then prove
 * a receipt is in a sealed tide with an inclusion proof, and that the tide was published by a
 * certain ledger close, without trusting Moon.
 *
 * Because every tide includes the previous tide's hash, the newest tide commits to the whole
 * history. Re-sealing with stronger cryptography later means signing and anchoring that head again.
 */
import { createHash } from 'node:crypto';
import { MOON_DAY_NS, unixNsToMoonNs, moonNsToUnixNs, fromMoonNs, moonNsOf, unixNsToIso } from './moon.js';
import { leafHash, merkleRoot, inclusionProof } from './merkle.js';
import { signedBytes, type Receipt, type Signer } from './receipt.js';

export const TIDELINE = 'tideline/1';

// ---------- lunes ----------
const p2 = (n: number) => String(n).padStart(2, '0');
/** Global lune number (days since the Moon epoch) for a Unix time. */
export const luneOf = (unixNs: bigint): number => Number(unixNsToMoonNs(unixNs) / MOON_DAY_NS - (unixNsToMoonNs(unixNs) % MOON_DAY_NS < 0n ? 1n : 0n));
export const luneLabel = (lune: number): string => { const t = fromMoonNs(BigInt(lune) * MOON_DAY_NS); return `${t.year}.${p2(t.moon)}.${p2(t.day)}`; };
export function parseLune(label: string): number | null {
  const m = /^(\d{1,6})\.(\d{1,2})\.(\d{1,2})$/.exec(label);
  if (!m) return null;
  try { return Number(moonNsOf({ year: +m[1], moon: +m[2], day: +m[3] }) / MOON_DAY_NS); } catch { return null; }
}
export const luneStartNs = (lune: number): bigint => moonNsToUnixNs(BigInt(lune) * MOON_DAY_NS);
export const luneEndNs = (lune: number): bigint => luneStartNs(lune + 1);

// ---------- storage ----------
export interface TideStore {
  /** Append a leaf to a lune; returns its index. */
  append(lune: number, leaf: string): Promise<number>;
  leaves(lune: number): Promise<string[]>;
  getTide(lune: number): Promise<Tide | null>;
  /** Store a tide only if none exists for that lune. */
  putTide(tide: Tide): Promise<boolean>;
  /** The latest sealed lune, or null. */
  head(): Promise<number | null>;
  setHead(lune: number): Promise<void>;
  /** The first lune that has any receipt. */
  first(): Promise<number | null>;
  markFirst(lune: number): Promise<void>;
  recent(n: number): Promise<number[]>;
}

export function memoryStore(): TideStore {
  const L = new Map<number, string[]>(), T = new Map<number, Tide>(); let h: number | null = null, f: number | null = null;
  return {
    async append(l, x) { const a = L.get(l) ?? []; a.push(x); L.set(l, a); return a.length - 1; },
    async leaves(l) { return [...(L.get(l) ?? [])]; },
    async getTide(l) { return T.get(l) ?? null; },
    async putTide(t) { if (T.has(t.lune_index)) return false; T.set(t.lune_index, t); return true; },
    async head() { return h; }, async setHead(l) { h = l; },
    async first() { return f; }, async markFirst(l) { if (f === null) f = l; },
    async recent(n) { return [...T.keys()].sort((a, b) => b - a).slice(0, n); },
  };
}

/** Upstash Redis (REST). Keys: tl:leaves:<lune> (list), tl:tide:<lune>, tl:head, tl:first, tl:tides (sorted set). */
export function upstashStore(url: string, token: string): TideStore {
  const call = async (cmds: (string | number)[][]) => {
    const r = await fetch(`${url.replace(/\/$/, '')}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
    if (!r.ok) throw new Error('store ' + r.status);
    const out = (await r.json()) as { result?: unknown; error?: string }[];
    for (const o of out) if (o.error) throw new Error(o.error);
    return out.map((o) => o.result);
  };
  return {
    async append(l, x) { const [n] = await call([['RPUSH', `tl:leaves:${l}`, x]]); return Number(n) - 1; },
    async leaves(l) { const [a] = await call([['LRANGE', `tl:leaves:${l}`, 0, -1]]); return (a as string[]) ?? []; },
    async getTide(l) { const [v] = await call([['GET', `tl:tide:${l}`]]); return v ? (JSON.parse(v as string) as Tide) : null; },
    async putTide(t) { const [ok] = await call([['SET', `tl:tide:${t.lune_index}`, JSON.stringify(t), 'NX'], ['ZADD', 'tl:tides', t.lune_index, String(t.lune_index)]]); return ok === 'OK'; },
    async head() { const [v] = await call([['GET', 'tl:head']]); return v === null || v === undefined ? null : Number(v); },
    async setHead(l) { await call([['SET', 'tl:head', l]]); },
    async first() { const [v] = await call([['GET', 'tl:first']]); return v === null || v === undefined ? null : Number(v); },
    async markFirst(l) { await call([['SET', 'tl:first', l, 'NX']]); },
    async recent(n) { const [a] = await call([['ZRANGE', 'tl:tides', 0, n - 1, 'REV']]); return ((a as string[]) ?? []).map(Number); },
  };
}

// ---------- tides ----------
export interface Anchor { network: 'xrpl'; tx: string; ledger_index?: number; explorer: string }
export interface Tide {
  tideline: typeof TIDELINE;
  lune: string;            // YEAR.MM.DD
  lune_index: number;      // days since the Moon epoch
  size: number;            // receipts in the lune
  root: string;            // Merkle root (RFC 9162) of their leaves
  prev: string | null;     // hash of the previous tide, chaining the whole history
  ends_unix_ns: string;    // when the lune ended
  sealed_unix_ns: string;
  key_id: string; signature: string;                       // Ed25519 over tideBytes
  pq?: { alg: 'ML-DSA-65'; key_id: string; signature: string };
  anchor?: Anchor | null;  // XRP Ledger transaction carrying the tide hash
  hash: string;            // SHA-256 of tideBytes: the tide's identity
}

/** A receipt's leaf: its signed bytes, so the leaf is the same however the receipt is carried. */
export const receiptLeaf = (r: Receipt): string => {
  const { signature: _s, ...body } = r;
  return leafHash(new Uint8Array(signedBytes(body as Omit<Receipt, 'signature'>)));
};

/** The bytes Moon signs for a tide. One field per line. */
export const tideBytes = (t: Pick<Tide, 'lune' | 'lune_index' | 'size' | 'root' | 'prev' | 'ends_unix_ns' | 'sealed_unix_ns'>): Uint8Array =>
  new Uint8Array(Buffer.from([TIDELINE, `lune:${t.lune}`, `index:${t.lune_index}`, `size:${t.size}`, `root:${t.root}`, `prev:${t.prev ?? 'none'}`, `ends:${t.ends_unix_ns}`, `sealed:${t.sealed_unix_ns}`].join('\n'), 'utf8'));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Record a freshly signed receipt in its lune. */
export async function record(store: TideStore, r: Receipt): Promise<{ lune: string; index: number; leaf: string }> {
  const lune = luneOf(BigInt(r.unix_ns)), leaf = receiptLeaf(r);
  const index = await store.append(lune, leaf);
  if (index === 0) await store.markFirst(lune);
  return { lune: luneLabel(lune), index, leaf };
}

export type Anchorer = (tide: Tide) => Promise<Anchor | null>;

/**
 * Seal every finished lune that isn't sealed yet, oldest first (idempotent; safe to run any time).
 * Empty lunes are sealed too, so the chain has no gaps.
 */
export async function sealDue(store: TideStore, signer: Signer, nowNs: bigint, anchor?: Anchorer, max = 40): Promise<Tide[]> {
  const head = await store.head(), first = await store.first();
  if (first === null) return [];
  let next = head === null ? first : head + 1;
  const out: Tide[] = [];
  let prevHash = head === null ? null : (await store.getTide(head))?.hash ?? null;
  while (out.length < max && luneEndNs(next) <= nowNs) {
    const existing = await store.getTide(next);
    if (existing) { prevHash = existing.hash; await store.setHead(next); next++; continue; }
    const leaves = await store.leaves(next);
    const body = { lune: luneLabel(next), lune_index: next, size: leaves.length, root: merkleRoot(leaves), prev: prevHash, ends_unix_ns: luneEndNs(next).toString(), sealed_unix_ns: nowNs.toString() };
    const bytes = tideBytes(body);
    const s = signer.signBytes(bytes);
    const tide: Tide = { tideline: TIDELINE, ...body, key_id: s.key_id, signature: s.signature, ...(s.pq ? { pq: s.pq as Tide['pq'] } : {}), hash: sha(bytes), anchor: null };
    if (anchor) { try { tide.anchor = await anchor(tide); } catch { tide.anchor = null; } }
    if (await store.putTide(tide)) out.push(tide);
    await store.setHead(next);
    prevHash = tide.hash;
    next++;
  }
  return out;
}

/** Inclusion proof for a receipt, once its lune is sealed. */
export async function proofFor(store: TideStore, r: Receipt) {
  const lune = luneOf(BigInt(r.unix_ns)), leaf = receiptLeaf(r);
  const leaves = await store.leaves(lune);
  const index = leaves.indexOf(leaf);
  if (index < 0) return { status: 'not_found' as const, lune: luneLabel(lune), leaf };
  const tide = await store.getTide(lune);
  if (!tide) return { status: 'pending' as const, lune: luneLabel(lune), leaf, index, seals_after_utc: unixNsToIso(luneEndNs(lune)) };
  return { status: 'sealed' as const, lune: tide.lune, leaf, index, size: tide.size, path: inclusionProof(index, leaves.slice(0, tide.size)), root: tide.root, tide };
}

/** Check a tide's own signatures and hash (pure). Pair with verifyInclusion for a receipt. */
export function tideHashOk(t: Tide): boolean { return sha(tideBytes(t)) === t.hash; }
