/**
 * OpenTimestamps: anchor a tide in Bitcoin for free.
 *
 * Moon sends the tide's SHA-256 to public OpenTimestamps calendars. Each calendar batches it with
 * others into a Bitcoin transaction, usually within a few hours. The result is a standard .ots proof
 * that anyone can check with the OpenTimestamps tools and a Bitcoin node, without trusting Moon or
 * the calendars: `ots verify -f tide.txt tide.txt.ots`.
 *
 * This file speaks the .ots format directly (serialize, parse, upgrade), with no dependencies.
 */
import { createHash } from 'node:crypto';

export const CALENDARS = ['https://a.pool.opentimestamps.org', 'https://b.pool.opentimestamps.org', 'https://a.pool.eternitywall.com', 'https://ots.btc.catallaxy.com'];
const MAGIC = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex');
const TAG_PENDING = '83dfe30d2ef90c8e', TAG_BITCOIN = '0588960d73d71901';
const OP = { sha256: 0x08, sha1: 0x02, ripemd160: 0x03, keccak256: 0x67, append: 0xf0, prepend: 0xf1, reverse: 0xf2, hexlify: 0xf3 } as const;

export interface Att { tag: string; payload: Buffer }
export interface Node { atts: Att[]; ops: { op: number; arg?: Buffer; child: Node }[] }

// ---------- varints ----------
function writeVaruint(n: number, out: number[]) { do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n); }
function readVaruint(b: Buffer, p: { i: number }) { let n = 0, s = 1, x; do { if (p.i >= b.length) throw new Error('truncated'); x = b[p.i++]; n += (x & 0x7f) * s; s *= 128; } while (x & 0x80); return n; }
const readBytes = (b: Buffer, p: { i: number }) => { const n = readVaruint(b, p); if (n > 8192 || p.i + n > b.length) throw new Error('bad length'); const o = b.subarray(p.i, p.i + n); p.i += n; return Buffer.from(o); };

// ---------- parse / serialize a timestamp tree ----------
export function parseNode(b: Buffer, p = { i: 0 }, depth = 0): Node {
  if (depth > 256) throw new Error('too deep');
  const node: Node = { atts: [], ops: [] };
  const item = () => {
    const tag = b[p.i++];
    if (tag === 0x00) { const t = b.subarray(p.i, p.i + 8).toString('hex'); p.i += 8; node.atts.push({ tag: t, payload: readBytes(b, p) }); return; }
    const arg = tag === OP.append || tag === OP.prepend ? readBytes(b, p) : undefined;
    if (!Object.values(OP).includes(tag as never)) throw new Error('unknown op ' + tag);
    node.ops.push({ op: tag, arg, child: parseNode(b, p, depth + 1) });
  };
  while (b[p.i] === 0xff) { p.i++; item(); }
  item();
  return node;
}
export function serializeNode(n: Node): Buffer {
  const items: Buffer[] = [];
  for (const a of n.atts) { const out = [0x00, ...Buffer.from(a.tag, 'hex')]; writeVaruint(a.payload.length, out); items.push(Buffer.concat([Buffer.from(out), a.payload])); }
  for (const o of n.ops) {
    const head = [o.op]; if (o.arg) writeVaruint(o.arg.length, head);
    items.push(Buffer.concat([Buffer.from(head), o.arg ?? Buffer.alloc(0), serializeNode(o.child)]));
  }
  if (!items.length) throw new Error('empty timestamp');
  return Buffer.concat(items.map((x, i) => (i < items.length - 1 ? Buffer.concat([Buffer.from([0xff]), x]) : x)));
}

function apply(op: number, msg: Buffer, arg?: Buffer): Buffer {
  switch (op) {
    case OP.sha256: return createHash('sha256').update(msg).digest();
    case OP.sha1: return createHash('sha1').update(msg).digest();
    case OP.ripemd160: return createHash('ripemd160').update(msg).digest();
    case OP.keccak256: return createHash('sha3-256').update(msg).digest(); // not used by Bitcoin calendars
    case OP.append: return Buffer.concat([msg, arg!]);
    case OP.prepend: return Buffer.concat([arg!, msg]);
    case OP.reverse: return Buffer.from(msg).reverse();
    case OP.hexlify: return Buffer.from(msg.toString('hex'), 'utf8');
  }
  throw new Error('op');
}

// ---------- the .ots file ----------
/** A detached .ots file for a SHA-256 digest: header, file hash, and the timestamp tree. */
export function otsFile(digest: Buffer, root: Node): Buffer {
  return Buffer.concat([MAGIC, Buffer.from([0x01, OP.sha256]), digest, serializeNode(root)]);
}
export function parseOtsFile(f: Buffer): { digest: Buffer; root: Node } {
  if (!f.subarray(0, MAGIC.length).equals(MAGIC) || f[MAGIC.length] !== 0x01 || f[MAGIC.length + 1] !== OP.sha256) throw new Error('not a sha256 .ots file');
  const at = MAGIC.length + 2, digest = f.subarray(at, at + 32);
  return { digest: Buffer.from(digest), root: parseNode(f, { i: at + 32 }) };
}

/** What the proof says: pending calendars, and any Bitcoin block heights reached. */
export function attestations(root: Node): { pending: string[]; bitcoin: number[] } {
  const out = { pending: [] as string[], bitcoin: [] as number[] };
  const walk = (n: Node) => {
    for (const a of n.atts) {
      if (a.tag === TAG_PENDING) { const p = { i: 0 }; out.pending.push(readBytes(a.payload, p).toString('utf8')); }
      if (a.tag === TAG_BITCOIN) { const p = { i: 0 }; out.bitcoin.push(readVaruint(a.payload, p)); }
    }
    for (const o of n.ops) walk(o.child);
  };
  walk(root);
  return out;
}

const okUrl = (u: string) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u);

/** Stamp a digest at the calendars. Returns the .ots file, or null if no calendar answered. */
export async function stamp(digestHex: string, fetchImpl: typeof fetch = fetch, calendars = CALENDARS, timeoutMs = 6000): Promise<Buffer | null> {
  const digest = Buffer.from(digestHex, 'hex');
  const res = await Promise.all(calendars.map(async (c) => {
    try {
      const r = await fetchImpl(`${c}/digest`, { method: 'POST', body: digest, headers: { Accept: 'application/vnd.opentimestamps.v1', 'User-Agent': 'moon-tideline' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) return null;
      const node = parseNode(Buffer.from(await r.arrayBuffer()));
      return node;
    } catch { return null; }
  }));
  const nodes = res.filter((x): x is Node => !!x);
  if (!nodes.length) return null;
  // Every calendar's answer hangs off the same digest: merge them as branches of one root.
  const root: Node = { atts: [], ops: [] };
  for (const n of nodes) { root.atts.push(...n.atts); root.ops.push(...n.ops); }
  return otsFile(digest, root);
}

/**
 * Upgrade a pending proof: ask each pending calendar for the rest of the path to Bitcoin.
 * Calendars answer once their transaction has confirmed. Returns the new file and whether it changed.
 */
export async function upgrade(file: Buffer, fetchImpl: typeof fetch = fetch, timeoutMs = 6000): Promise<{ file: Buffer; changed: boolean }> {
  const { digest, root } = parseOtsFile(file);
  let changed = false;
  const walk = async (n: Node, msg: Buffer) => {
    for (const a of [...n.atts]) {
      if (a.tag !== TAG_PENDING) continue;
      const url = readBytes(a.payload, { i: 0 }).toString('utf8');
      if (!okUrl(url)) continue;
      try {
        const r = await fetchImpl(`${url}/timestamp/${msg.toString('hex')}`, { headers: { Accept: 'application/vnd.opentimestamps.v1', 'User-Agent': 'moon-tideline' }, signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) continue;
        const sub = parseNode(Buffer.from(await r.arrayBuffer()));
        if (!attestations(sub).bitcoin.length) continue;
        n.atts.splice(n.atts.indexOf(a), 1);
        n.atts.push(...sub.atts); n.ops.push(...sub.ops);
        changed = true;
      } catch { /* try again next time */ }
    }
    for (const o of n.ops) await walk(o.child, apply(o.op, msg, o.arg));
  };
  await walk(root, digest);
  // A node left with nothing (all pending removed, nothing added) would be invalid; drop such ops is not needed since we only remove on success.
  return { file: changed ? otsFile(digest, root) : file, changed };
}

/** Pure check that a proof commits to this digest and which Bitcoin blocks it reaches (the block headers themselves are checked by `ots verify`). */
export function summarize(file: Buffer) { const { digest, root } = parseOtsFile(file); return { digest: digest.toString('hex'), ...attestations(root) }; }
