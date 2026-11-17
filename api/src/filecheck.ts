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

export interface FileCheck { match: boolean; sha256: string; bytes: number; content_type: string | null; image: boolean; final_url: string }

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
  const h = createHash('sha256'), reader = r.body.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > FILE_CHECK_MAX) { await reader.cancel().catch(() => {}); throw new FileCheckError('too_large', 'Files over 25 MB are not checked'); }
    h.update(value);
  }
  const sha = h.digest('hex'), ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() || null;
  return { match: sha === want, sha256: sha, bytes: n, content_type: ct, image: !!ct && /^image\/(png|jpeg|gif|webp|avif|svg\+xml)$/.test(ct), final_url: u.toString() };
}
