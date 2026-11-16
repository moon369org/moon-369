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
  /** Replace a tide (only its anchors ever change after sealing). */
  updateTide(tide: Tide): Promise<void>;
  /** The tide's OpenTimestamps proof (.ots bytes). */
  getOts(lune: number): Promise<Buffer | null>;
  putOts(lune: number, file: Buffer): Promise<void>;
  /** Take a short lock (true if this caller got it). */
  lock(key: string, seconds: number): Promise<boolean>;
  addCheckpoint(cp: Checkpoint): Promise<void>;
  checkpoints(lune: number): Promise<Checkpoint[]>;
}

export function memoryStore(): TideStore {
  const L = new Map<number, string[]>(), T = new Map<number, Tide>(), O = new Map<number, Buffer>(), K = new Map<string, number>(), C = new Map<number, Checkpoint[]>(); let h: number | null = null, f: number | null = null;
  return {
    async append(l, x) { const a = L.get(l) ?? []; a.push(x); L.set(l, a); return a.length - 1; },
    async leaves(l) { return [...(L.get(l) ?? [])]; },
    async getTide(l) { return T.get(l) ?? null; },
    async putTide(t) { if (T.has(t.lune_index)) return false; T.set(t.lune_index, t); return true; },
    async head() { return h; }, async setHead(l) { h = l; },
    async first() { return f; }, async markFirst(l) { if (f === null) f = l; },
    async recent(n) { return [...T.keys()].sort((a, b) => b - a).slice(0, n); },
    async updateTide(t) { T.set(t.lune_index, t); },
    async getOts(l) { return O.get(l) ?? null; },
    async putOts(l, f) { O.set(l, f); },
    async lock(k, sec) { const now = Date.now(); if ((K.get(k) ?? 0) > now) return false; K.set(k, now + sec * 1000); return true; },
    async addCheckpoint(cp) { const a = C.get(cp.lune_index) ?? []; a.push(cp); C.set(cp.lune_index, a); },
    async checkpoints(l) { return [...(C.get(l) ?? [])]; },
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
    async updateTide(t) { await call([['SET', `tl:tide:${t.lune_index}`, JSON.stringify(t)]]); },
    async getOts(l) { const [v] = await call([['GET', `tl:ots:${l}`]]); return v ? Buffer.from(v as string, 'base64') : null; },
    async putOts(l, f) { await call([['SET', `tl:ots:${l}`, f.toString('base64')]]); },
    async lock(k, sec) { const [ok] = await call([['SET', `tl:lock:${k}`, '1', 'NX', 'EX', sec]]); return ok === 'OK'; },
    async addCheckpoint(cp) { await call([['RPUSH', `tl:cp:${cp.lune_index}`, JSON.stringify(cp)]]); },
    async checkpoints(l) { const [a] = await call([['LRANGE', `tl:cp:${l}`, 0, -1]]); return ((a as string[]) ?? []).map((x) => JSON.parse(x) as Checkpoint); },
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
  bitcoin?: { status: 'pending' | 'confirmed'; calendars: number; block_height?: number; ots: string } | null; // OpenTimestamps
  hash: string;            // SHA-256 of tideBytes: the tide's identity
}

/**
 * A checkpoint: while a lune is open, Moon locks its receipts so far on the XRP Ledger about once a
 * minute, so no receipt waits a whole lune for a public lock. It is the same Merkle root a tide uses,
 * over the first `size` receipts of the lune, signed and anchored.
 */
export interface Checkpoint {
  tideline: typeof TIDELINE; kind: 'checkpoint';
  lune: string; lune_index: number; size: number; root: string; at_unix_ns: string;
  key_id: string; signature: string; pq?: { alg: 'ML-DSA-65'; key_id: string; signature: string };
  hash: string; anchor?: Anchor | null;
}
export const checkpointBytes = (c: Pick<Checkpoint, 'lune' | 'lune_index' | 'size' | 'root' | 'at_unix_ns'>): Uint8Array =>
  new Uint8Array(Buffer.from([TIDELINE + '/checkpoint', `lune:${c.lune}`, `index:${c.lune_index}`, `size:${c.size}`, `root:${c.root}`, `at:${c.at_unix_ns}`].join('\n'), 'utf8'));

/** Checkpoint the open lune if a minute has passed since the last one and anything new was signed. */
export async function checkpoint(store: TideStore, signer: Signer, nowNs: bigint, anchor: Anchorer, everySec = 60): Promise<Checkpoint | null> {
  const lune = luneOf(nowNs);
  if (!(await store.lock(`cp:${lune}`, everySec))) return null;
  const leaves = await store.leaves(lune);
  const prev = (await store.checkpoints(lune)).at(-1);
  if (!leaves.length || (prev && prev.size >= leaves.length)) return null;
  const body = { lune: luneLabel(lune), lune_index: lune, size: leaves.length, root: merkleRoot(leaves), at_unix_ns: nowNs.toString() };
  const bytes = checkpointBytes(body), sig = signer.signBytes(bytes);
  const cp: Checkpoint = { tideline: TIDELINE, kind: 'checkpoint', ...body, key_id: sig.key_id, signature: sig.signature, ...(sig.pq ? { pq: sig.pq as Checkpoint['pq'] } : {}), hash: sha(bytes), anchor: null };
  try { cp.anchor = await anchor({ lune: `${cp.lune} checkpoint ${cp.size}`, hash: cp.hash }); } catch { cp.anchor = null; }
  if (!cp.anchor) return null;   // only anchored checkpoints are kept: they are the point
  await store.addCheckpoint(cp);
  return cp;
}

/**
 * Run after a signing: checkpoint now if no one did recently, otherwise wait out the short lock and
 * try once more, so the last receipt before a quiet spell still gets locked within about a minute.
 */
export async function checkpointSoon(store: TideStore, signer: Signer, now: () => bigint, anchor: Anchorer, everySec = 20, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<Checkpoint | null> {
  const first = await checkpoint(store, signer, now(), anchor, everySec);
  if (first) return first;
  await sleep((everySec + 1) * 1000);
  return checkpoint(store, signer, now(), anchor, everySec);
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

/** Writes a fingerprint to a ledger. `lune` names what is anchored (a tide, or a lune's checkpoint). */
export type Anchorer = (t: { lune: string; hash: string }) => Promise<Anchor | null>;
/** Bitcoin anchoring through OpenTimestamps: stamp a digest, later upgrade the proof. */
export interface BitcoinStamper { stamp(digestHex: string): Promise<Buffer | null>; upgrade(file: Buffer): Promise<{ file: Buffer; changed: boolean }>; summarize(file: Buffer): { bitcoin: number[]; pending: string[] } }

/**
 * Seal every finished lune that isn't sealed yet, oldest first (idempotent; safe to run any time).
 * Empty lunes are sealed too, so the chain has no gaps.
 */
export async function sealDue(store: TideStore, signer: Signer, nowNs: bigint, anchor?: Anchorer, max = 40, btc?: BitcoinStamper): Promise<Tide[]> {
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
    let ots: Buffer | null = null;
    if (btc) {
      try {
        ots = await btc.stamp(tide.hash);
        if (ots) tide.bitcoin = { status: 'pending', calendars: btc.summarize(ots).pending.length, ots: `/v1/tideline/${tide.lune}.ots` };
      } catch { /* the next run can stamp it */ }
    }
    if (await store.putTide(tide)) {
      if (ots) await store.putOts(next, ots);   // only the run whose tide was kept writes its proof
      out.push(tide);
      prevHash = tide.hash;
    } else {
      prevHash = (await store.getTide(next))?.hash ?? tide.hash;   // another run sealed it first: chain onto theirs
    }
    await store.setHead(next);
    next++;
  }
  return out;
}

/** True when a finished lune is waiting to be sealed. Two cheap reads. */
export async function sealIsDue(store: TideStore, nowNs: bigint): Promise<boolean> {
  const head = await store.head();
  const next = head === null ? await store.first() : head + 1;
  return next !== null && luneEndNs(next) <= nowNs;
}

/** Seal right away once a lune ends, on the first request after it, instead of waiting for the nightly run. */
export async function sealIfDue(store: TideStore, signer: Signer, nowNs: bigint, anchor?: Anchorer, btc?: BitcoinStamper): Promise<Tide[]> {
  return (await sealIsDue(store, nowNs)) ? sealDue(store, signer, nowNs, anchor, 5, btc) : [];
}

/** Inclusion proof for a receipt, once its lune is sealed. */
export async function proofFor(store: TideStore, r: Receipt) {
  const lune = luneOf(BigInt(r.unix_ns)), leaf = receiptLeaf(r);
  const leaves = await store.leaves(lune);
  const index = leaves.indexOf(leaf);
  if (index < 0) return { status: 'not_found' as const, lune: luneLabel(lune), leaf };
  const tide = await store.getTide(lune);
  if (!tide) {
    const cp = (await store.checkpoints(lune)).find((c) => c.size > index);
    if (cp) return { status: 'checkpointed' as const, lune: luneLabel(lune), leaf, index, size: cp.size, path: inclusionProof(index, leaves.slice(0, cp.size)), root: cp.root, checkpoint: cp, seals_after_utc: unixNsToIso(luneEndNs(lune)) };
    return { status: 'pending' as const, lune: luneLabel(lune), leaf, index, seals_after_utc: unixNsToIso(luneEndNs(lune)) };
  }
  return { status: 'sealed' as const, lune: tide.lune, leaf, index, size: tide.size, path: inclusionProof(index, leaves.slice(0, tide.size)), root: tide.root, tide };
}

/** Check a tide's own signatures and hash (pure). Pair with verifyInclusion for a receipt. */
export function tideHashOk(t: Tide): boolean { return sha(tideBytes(t)) === t.hash; }

/** Ask the calendars whether recent tides have reached Bitcoin, and record it when they have. */
export async function upgradeBitcoin(store: TideStore, btc: BitcoinStamper, recentN = 30): Promise<string[]> {
  const done: string[] = [];
  for (const l of await store.recent(recentN)) {
    const t = await store.getTide(l);
    if (!t) continue;
    let f = await store.getOts(l);
    if (!f && !t.bitcoin) {   // sealed while the calendars were unreachable: stamp it now
      try { f = await btc.stamp(t.hash); } catch { f = null; }
      if (!f) continue;
      await store.putOts(l, f);
      t.bitcoin = { status: 'pending', calendars: btc.summarize(f).pending.length, ots: `/v1/tideline/${t.lune}.ots` };
      await store.updateTide(t);
      continue;
    }
    if (!f || t.bitcoin?.status === 'confirmed') continue;
    try {
      const u = await btc.upgrade(f);
      const blocks = btc.summarize(u.file).bitcoin;
      if (u.changed && blocks.length) {
        await store.putOts(l, u.file);
        t.bitcoin = { status: 'confirmed', calendars: t.bitcoin?.calendars ?? 0, block_height: Math.min(...blocks), ots: `/v1/tideline/${t.lune}.ots` };
        await store.updateTide(t);
        done.push(t.lune);
      }
    } catch { /* try again next run */ }
  }
  return done;
}
