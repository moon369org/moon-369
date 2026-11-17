/**
 * Check a file a creator links to from their Moonmark: fetch it, fingerprint it, and say whether it is
 * exactly the file Moon signed. Moon never stores the file or serves it on; only the verdict comes back.
 *
 * Only public https links are fetched (no private or local addresses, no credentials, no odd ports),
 * up to 25 MB, following at most 3 redirects, each one checked again.
 */
import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { classifyHost, type HostClass } from './hosts.js';

export const FILE_CHECK_MAX = 25 * 1024 * 1024;

export class FileCheckError extends Error { constructor(public code: string, message: string) { super(message); } }

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x); if (m) return isPrivateIp(m[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith('64:ff9b:') || x.startsWith('2001:db8');
  }
  return true;
}

export type Lookup = (host: string) => Promise<string[]>;
const defaultLookup: Lookup = async (h) => (await dnsLookup(h, { all: true })).map((a) => a.address);

/** A link Moon is willing to fetch, or an error saying why not. */
export async function safeUrl(raw: string, lookup: Lookup = defaultLookup): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new FileCheckError('bad_url', 'That is not a valid link'); }
  if (u.protocol !== 'https:') throw new FileCheckError('bad_url', 'Only https links can be checked');
  if (u.username || u.password) throw new FileCheckError('bad_url', 'Links with a password in them are not checked');
  if (u.port && u.port !== '443') throw new FileCheckError('bad_url', 'Only the standard https port is allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/(^|\.)(localhost|local|internal|lan|home\.arpa)$/i.test(host)) throw new FileCheckError('blocked', 'That address is not public');
  const addrs = isIP(host) ? [host] : await lookup(host).catch(() => { throw new FileCheckError('unreachable', 'Could not find that site'); });
  if (!addrs.length || addrs.some(isPrivateIp)) throw new FileCheckError('blocked', 'That address is not public');
  return u;
}

/** Clues that a file existed before it was signed: dates written inside it, the host's own date, a public library. */
export interface Provenance { created: { date: string; source: 'exif' | 'xmp' | 'png' } | null; last_modified: string | null; host: HostClass | null; library: string | null }
export interface FileCheck { match: boolean; sha256: string; bytes: number; content_type: string | null; image: boolean; final_url: string; provenance: Provenance }

const exifDate = (s: string): string | null => {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m || +m[1] < 1826 || m[1] === '0000') return null;
  const d = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(d) ? new Date(d).toISOString() : null;
};
/** Read DateTimeOriginal (or DateTime) from a TIFF/EXIF block. */
function tiffDate(b: Uint8Array, base: number): string | null {
  if (base + 8 > b.length) return null;
  const le = b[base] === 0x49, u16 = (o: number) => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
  const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0;
  const ascii = (o: number, n: number) => { const off = n > 4 ? base + u32(o) : o; return off + n <= b.length ? String.fromCharCode(...b.subarray(off, off + n)).replace(/\0+$/, '') : ''; };
  const found: Record<number, string> = {};
  const walk = (ifd: number, depth: number) => {
    const at = base + ifd; if (depth > 2 || at + 2 > b.length) return;
    const n = u16(at);
    for (let i = 0; i < n && at + 2 + i * 12 + 12 <= b.length; i++) {
      const e = at + 2 + i * 12, tag = u16(e), cnt = u32(e + 4);
      if ((tag === 0x9003 || tag === 0x9004 || tag === 0x0132) && cnt < 64) found[tag] = ascii(e + 8, cnt);
      if (tag === 0x8769) walk(u32(e + 8), depth + 1);
    }
  };
  walk(u32(base + 4), 0);
  return exifDate(found[0x9003] || found[0x9004] || found[0x0132] || '');
}
/** The creation date written inside an image, if any: EXIF (JPEG, PNG eXIf), XMP, or PNG tIME. */
export function embeddedDate(b: Uint8Array): Provenance['created'] {
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 4 < b.length;) {
      if (b[i] !== 0xff) break;
      const mk = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (mk === 0xe1 && String.fromCharCode(...b.subarray(i + 4, i + 10)) === 'Exif\0\0') { const d = tiffDate(b, i + 10); if (d) return { date: d, source: 'exif' }; }
      if (mk === 0xda) break;
      i += 2 + len;
    }
  }
  if (b[0] === 0x89 && b[1] === 0x50) {
    for (let i = 8; i + 12 <= b.length;) {
      const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0, type = String.fromCharCode(...b.subarray(i + 4, i + 8));
      if (type === 'eXIf') { const d = tiffDate(b, i + 8); if (d) return { date: d, source: 'exif' }; }
      if (type === 'tIME' && len === 7) { const o = i + 8; return { date: new Date(Date.UTC((b[o] << 8) | b[o + 1], b[o + 2] - 1, b[o + 3], b[o + 4], b[o + 5], b[o + 6])).toISOString(), source: 'png' }; }
      if (type === 'IEND') break;
      i += 12 + len;
    }
  }
  const text = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 512 * 1024)));
  const x = /(?:xmp:CreateDate|photoshop:DateCreated|exif:DateTimeOriginal)(?:="|>)(\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?)/.exec(text);
  if (x) { const d = Date.parse(x[1]); if (Number.isFinite(d)) return { date: new Date(d).toISOString(), source: 'xmp' }; }
  return null;
}

export async function checkLinkedFile(raw: string, want: string, opts: { fetch?: typeof fetch; lookup?: Lookup; timeoutMs?: number } = {}): Promise<FileCheck> {
  const f = opts.fetch ?? fetch, deadline = AbortSignal.timeout(opts.timeoutMs ?? 12_000);
  let u = await safeUrl(raw, opts.lookup), r: Response | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    r = await f(u.toString(), { redirect: 'manual', signal: deadline, headers: { 'User-Agent': 'Moon file check (+https://moon369.org/sign)', Accept: 'image/*,*/*;q=0.5' } })
      .catch(() => { throw new FileCheckError('unreachable', 'Could not download the file'); });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      if (hop === 3) throw new FileCheckError('unreachable', 'Too many redirects');
      u = await safeUrl(new URL(r.headers.get('location')!, u).toString(), opts.lookup);
      continue;
    }
    break;
  }
  if (!r || !r.ok || !r.body) throw new FileCheckError('unreachable', `The link answered ${r?.status ?? 'nothing'}`);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > FILE_CHECK_MAX) throw new FileCheckError('too_large', 'Files over 25 MB are not checked');
  const h = createHash('sha256'), reader = r.body.getReader(), head: Uint8Array[] = [];
  let n = 0, kept = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > FILE_CHECK_MAX) { await reader.cancel().catch(() => {}); throw new FileCheckError('too_large', 'Files over 25 MB are not checked'); }
    h.update(value);
    if (kept < 1024 * 1024) { head.push(value); kept += value.byteLength; }
  }
  const first = new Uint8Array(kept); { let o = 0; for (const c of head) { first.set(c, o); o += c.byteLength; } }
  const lm = Date.parse(r.headers.get('last-modified') || '');
  const host = (await classifyHost(new URL(raw).hostname, { fetch: f, lookup: opts.lookup }).catch(() => null)) ?? (u.hostname !== new URL(raw).hostname ? await classifyHost(u.hostname, { fetch: f, lookup: opts.lookup }).catch(() => null) : null);
  const provenance: Provenance = { created: embeddedDate(first), last_modified: Number.isFinite(lm) ? new Date(lm).toISOString() : null, host, library: host?.kind === 'library' ? host.name : null };
  const sha = h.digest('hex'), ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() || null;
  return { match: sha === want, sha256: sha, bytes: n, content_type: ct, image: !!ct && /^image\/(png|jpeg|gif|webp|avif|svg\+xml)$/.test(ct), final_url: u.toString(), provenance };
}
