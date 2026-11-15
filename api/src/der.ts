// Minimal DER (ASN.1) encoder and reader, enough for RFC 3161 time-stamping and CMS.

export type Bytes = Uint8Array;

const cat = (parts: Bytes[]): Bytes => {
  const n = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

function len(n: number): Bytes {
  if (n < 0x80) return Uint8Array.of(n);
  const b: number[] = []; while (n > 0) { b.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Uint8Array.of(0x80 | b.length, ...b);
}

export const tlv = (tag: number, ...content: Bytes[]): Bytes => { const c = cat(content); return cat([Uint8Array.of(tag), len(c.length), c]); };
export const seq = (...c: Bytes[]) => tlv(0x30, ...c);
export const set = (...c: Bytes[]) => tlv(0x31, ...c);
/** SET OF in DER order: elements sorted by their encodings. */
export const setOf = (...c: Bytes[]) => tlv(0x31, ...[...c].sort(cmp));
export const octet = (b: Bytes) => tlv(0x04, b);
export const utf8 = (s: string) => tlv(0x0c, new TextEncoder().encode(s));
export const bool = (v: boolean) => tlv(0x01, Uint8Array.of(v ? 0xff : 0));
/** Context-specific tag [n], constructed (explicit, or implicit over a constructed type). */
export const ctx = (n: number, ...c: Bytes[]) => tlv(0xa0 | n, ...c);
/** Context-specific tag [n], primitive (implicit over a primitive type). */
export const ctxPrim = (n: number, raw: Bytes) => tlv(0x80 | n, raw);

function cmp(a: Bytes, b: Bytes): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** INTEGER from a non-negative bigint (or raw unsigned big-endian bytes). */
export function int(v: bigint | number | Bytes): Bytes {
  let b: number[];
  if (v instanceof Uint8Array) { b = [...v]; while (b.length > 1 && b[0] === 0) b.shift(); }
  else { let x = BigInt(v); if (x < 0n) throw new Error('negative INTEGER not supported'); b = []; do { b.unshift(Number(x & 0xffn)); x >>= 8n; } while (x > 0n); }
  if (b.length === 0) b = [0];
  if (b[0] & 0x80) b.unshift(0);
  return tlv(0x02, Uint8Array.from(b));
}

export function oid(s: string): Bytes {
  const arcs = s.split('.').map((x) => BigInt(x));
  const out: number[] = [];
  const push = (v: bigint) => { const t: number[] = [Number(v & 0x7fn)]; v >>= 7n; while (v > 0n) { t.unshift(Number(v & 0x7fn) | 0x80); v >>= 7n; } out.push(...t); };
  push(arcs[0] * 40n + arcs[1]);
  for (const a of arcs.slice(2)) push(a);
  return tlv(0x06, Uint8Array.from(out));
}

/** GeneralizedTime with fractional seconds, trailing zeros dropped (DER). */
export function gtime(unixNs: bigint, digits = 6): Bytes {
  const ms = Number(unixNs / 1_000_000n), d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  let frac = String(unixNs % 1_000_000_000n).padStart(9, '0').slice(0, digits).replace(/0+$/, '');
  const s = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${frac ? '.' + frac : ''}Z`;
  return tlv(0x18, new TextEncoder().encode(s));
}

/** BIT STRING with the named bits set (as used by PKIFailureInfo), minimally encoded. */
export function bits(...on: number[]): Bytes {
  const top = Math.max(...on), nbytes = Math.floor(top / 8) + 1, b = new Uint8Array(nbytes);
  for (const i of on) b[Math.floor(i / 8)] |= 0x80 >> (i % 8);
  const unused = nbytes * 8 - 1 - top;
  return tlv(0x03, Uint8Array.of(unused), b);
}

// ---- reading ----

export interface Node { tag: number; start: number; hdr: number; len: number; end: number; buf: Bytes }

export function read(buf: Bytes, at = 0): Node {
  if (at + 2 > buf.length) throw new Error('truncated');
  const tag = buf[at];
  if ((tag & 0x1f) === 0x1f) throw new Error('high tag numbers not supported');
  let l = buf[at + 1], hdr = 2;
  if (l & 0x80) {
    const n = l & 0x7f;
    if (n === 0 || n > 4) throw new Error('bad length');
    l = 0; for (let i = 0; i < n; i++) l = l * 256 + buf[at + 2 + i];
    hdr += n;
  }
  const end = at + hdr + l;
  if (end > buf.length) throw new Error('truncated');
  return { tag, start: at, hdr, len: l, end, buf };
}

export const value = (n: Node): Bytes => n.buf.subarray(n.start + n.hdr, n.end);
export const raw = (n: Node): Bytes => n.buf.subarray(n.start, n.end);

export function kids(n: Node): Node[] {
  const out: Node[] = []; let at = n.start + n.hdr;
  while (at < n.end) { const k = read(n.buf, at); out.push(k); at = k.end; }
  if (at !== n.end) throw new Error('bad nesting');
  return out;
}

export function readOid(n: Node): string {
  if (n.tag !== 0x06) throw new Error('expected OID');
  const v = value(n), arcs: bigint[] = []; let x = 0n;
  for (const b of v) { x = (x << 7n) | BigInt(b & 0x7f); if (!(b & 0x80)) { arcs.push(x); x = 0n; } }
  const first = arcs[0] < 80n ? arcs[0] / 40n : 2n;
  return [first, arcs[0] - first * 40n, ...arcs.slice(1)].join('.');
}

export function readInt(n: Node): bigint {
  if (n.tag !== 0x02) throw new Error('expected INTEGER');
  const v = value(n); let x = 0n;
  for (const b of v) x = (x << 8n) | BigInt(b);
  if (v.length && v[0] & 0x80) x -= 1n << BigInt(v.length * 8);
  return x;
}

export { cat };
