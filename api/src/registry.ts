// The registry: who registered which fingerprint, and when. It powers lookups by file alone
// ("is this file on Moon?") and by look-alike images ("is this a copy of something on Moon?").
//
// Each registration is a statement Moon signs:
//   moon-registration/1\n sha256:<hex>\n <moonmark>\n <unix_ns>\n registrant:<API key owner or "anonymous">\n registrant_verified:<yes|no>\n
//   on_behalf_of:<as the registrant states it>\n label:<free text>\n phash:<16 hex or "">\n receipt:<receipt signature>
// The registrant comes from the API key. Moon vouches for it (registrant_verified: yes) only for keys it
// issued by hand; free self-serve keys carry whatever name was typed. on_behalf_of and label are the
// registrant's own words: Moon records them and signs that they were said, not that they are true.
import type { Receipt } from './receipt.js';

export const REGISTRATION = 'moon-registration/1';

export interface Registration {
  registration: typeof REGISTRATION;
  sha256: string;
  moonmark: string;
  unix_ns: string;
  registrant: string;          // the API key owner, or "anonymous" on the open tier
  registrant_verified: boolean; // true only for keys Moon issued
  on_behalf_of: string | null; // stated by the registrant
  label: string | null;        // stated by the registrant
  phash: string | null;        // 64-bit image difference hash, hex; for look-alike lookups
  receipt_signature: string;
  signed_url: string;
  signature: { key_id: string; signature: string };
}

export function registrationBytes(r: Omit<Registration, 'signature' | 'signed_url'>): Uint8Array {
  return new TextEncoder().encode([
    r.registration, 'sha256:' + r.sha256, r.moonmark, r.unix_ns, 'registrant:' + r.registrant, 'registrant_verified:' + (r.registrant_verified ? 'yes' : 'no'),
    'on_behalf_of:' + (r.on_behalf_of ?? ''), 'label:' + (r.label ?? ''), 'phash:' + (r.phash ?? ''), 'receipt:' + r.receipt_signature,
  ].join('\n'));
}

export function makeRegistration(
  receipt: Receipt, signedUrl: string, who: { registrant: string; registrant_verified?: boolean; on_behalf_of?: string | null; label?: string | null; phash?: string | null },
  signBytes: (b: Uint8Array) => { key_id: string; signature: string },
): Registration {
  const base = {
    registration: REGISTRATION as typeof REGISTRATION,
    sha256: receipt.sha256, moonmark: receipt.moonmark, unix_ns: String(receipt.unix_ns),
    registrant: who.registrant, registrant_verified: who.registrant_verified === true, on_behalf_of: who.on_behalf_of ?? null, label: who.label ?? null, phash: who.phash ?? null,
    receipt_signature: receipt.signature,
  };
  const s = signBytes(registrationBytes(base));
  return { ...base, signed_url: signedUrl, signature: { key_id: s.key_id, signature: s.signature } };
}

// ---------- perceptual hash helpers ----------
export const isPhash = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x);
/** Bits that differ between two 64-bit hashes. */
export function hamming(a: string, b: string): number {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}
/** Four 16-bit bands. Two images within 3 bits share at least one band exactly (pigeonhole). */
export const bands = (p: string) => [0, 1, 2, 3].map((i) => `${i}:${p.slice(i * 4, i * 4 + 4)}`);
/** Look-alike threshold: at most this many of 64 bits differ. */
export const SIMILAR_BITS = 10;

// ---------- store ----------
export interface RegistryStore {
  add(r: Registration): Promise<void>;
  bySha(sha: string, max: number): Promise<Registration[]>;
  candidatesByBand(band: string): Promise<string[]>;
  /** Registrations signed in [fromMs, toMs), oldest first. */
  byTime?(fromMs: number, toMs: number, max: number): Promise<Registration[]>;
  /** A verified registrant's registrations, newest first. */
  byRegistrant?(slug: string, max: number, beforeMs?: number): Promise<Registration[]>;
  /** Verified registrations whose label contains the text, newest first. */
  byLabel?(text: string, max: number): Promise<Registration[]>;
  /** Remember which file a Tideline leaf (a receipt's log fingerprint) belongs to. */
  addLeaf?(leaf: string, sha: string): Promise<void>;
  shaByLeaf?(leaf: string): Promise<string | null>;
}

/** A registrant's name as a URL slug: "Moon" -> "moon", "Acme Inc." -> "acme-inc". */
export const registrantSlug = (name: string) =>
  name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
const msOf = (r: Registration) => Number(BigInt(r.unix_ns) / 1_000_000n);

export function memoryRegistry(): RegistryStore {
  const bySha = new Map<string, Registration[]>(), band = new Map<string, Set<string>>(), leaves = new Map<string, string>();
  return {
    async add(r) {
      (bySha.get(r.sha256) ?? bySha.set(r.sha256, []).get(r.sha256)!).push(r);
      if (r.phash) for (const b of bands(r.phash)) (band.get(b) ?? band.set(b, new Set()).get(b)!).add(r.sha256);
    },
    async bySha(sha, max) { return (bySha.get(sha) ?? []).slice(0, max); },
    async candidatesByBand(b) { return [...(band.get(b) ?? [])]; },
    async byTime(from, to, max) {
      return [...bySha.values()].flat().filter((r) => { const t = msOf(r); return t >= from && t < to; }).sort((a, b) => msOf(a) - msOf(b)).slice(0, max);
    },
    async byRegistrant(slug, max, before) {
      return [...bySha.values()].flat().filter((r) => r.registrant_verified && registrantSlug(r.registrant) === slug && (before === undefined || msOf(r) < before))
        .sort((a, b) => msOf(b) - msOf(a)).slice(0, max);
    },
    async byLabel(text, max) {
      const t = text.toLowerCase();
      return [...bySha.values()].flat().filter((r) => r.registrant_verified && (r.label ?? '').toLowerCase().includes(t)).sort((a, b) => msOf(b) - msOf(a)).slice(0, max);
    },
    async addLeaf(leaf, sha) { leaves.set(leaf, sha); },
    async shaByLeaf(leaf) { return leaves.get(leaf) ?? null; },
  };
}

export function upstashRegistry(url: string, token: string): RegistryStore {
  const call = async (cmds: (string | number)[][]) => {
    const r = await fetch(`${url.replace(/\/$/, '')}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
    if (!r.ok) throw new Error('registry ' + r.status);
    const out = (await r.json()) as { result?: unknown; error?: string }[];
    for (const o of out) if (o.error) throw new Error(o.error);
    return out.map((o) => o.result);
  };
  return {
    async add(r) {
      const j = JSON.stringify(r), cmds: (string | number)[][] = [['RPUSH', `rg:sha:${r.sha256}`, j], ...indexCmds(r, j)];
      if (r.phash) for (const b of bands(r.phash)) cmds.push(['SADD', `rg:ph:${b}`, r.sha256]);
      await call(cmds);
    },
    async bySha(sha, max) { const [a] = await call([['LRANGE', `rg:sha:${sha}`, 0, max - 1]]); return ((a as string[]) ?? []).map((x) => JSON.parse(x) as Registration); },
    async candidatesByBand(b) { const [a] = await call([['SRANDMEMBER', `rg:ph:${b}`, 200]]); return (a as string[]) ?? []; },
    async byTime(from, to, max) {
      await indexed();
      const [a] = await call([['ZRANGE', 'rg:t', from, `(${to}`, 'BYSCORE', 'LIMIT', 0, max]]);
      return ((a as string[]) ?? []).map((x) => JSON.parse(x) as Registration);
    },
    async byRegistrant(slug, max, before) {
      await indexed();
      const [a] = await call([['ZRANGE', `rg:by:${slug}`, before === undefined ? '+inf' : `(${before}`, '-inf', 'BYSCORE', 'REV', 'LIMIT', 0, max]]);
      return ((a as string[]) ?? []).map((x) => JSON.parse(x) as Registration);
    },
    async byLabel(text, max) {
      await indexed();
      const t = text.toLowerCase(), [slugs] = await call([['SMEMBERS', 'rg:verified']]);
      const lists = (slugs as string[] ?? []).length ? await call((slugs as string[]).map((sl) => ['ZRANGE', `rg:by:${sl}`, 0, 1999])) : [];
      return (lists as string[][]).flat().map((x) => JSON.parse(x) as Registration).filter((r) => (r.label ?? '').toLowerCase().includes(t))
        .sort((a, b) => msOf(b) - msOf(a)).slice(0, max);
    },
    async addLeaf(leaf, sha) { await call([['SET', `rg:leaf:${leaf}`, sha]]); },
    async shaByLeaf(leaf) { const [v] = await call([['GET', `rg:leaf:${leaf}`]]); return (v as string) ?? null; },
  };
  function indexCmds(r: Registration, j: string): (string | number)[][] {
    const out: (string | number)[][] = [['ZADD', 'rg:t', msOf(r), j]];
    if (r.registrant_verified) out.push(['ZADD', `rg:by:${registrantSlug(r.registrant)}`, msOf(r), j], ['SADD', 'rg:verified', registrantSlug(r.registrant)]);
    return out;
  }
  // Registrations made before these indexes existed: add them once, on the first search.
  async function indexed() {
    const [done] = await call([['GET', 'rg:ix:v1']]);
    if (done === 'done') return;
    const [lock] = await call([['SET', 'rg:ix:v1', 'running', 'NX', 'EX', 120]]);
    if (lock !== 'OK') return;
    let cursor = '0';
    do {
      const [res] = await call([['SCAN', cursor, 'MATCH', 'rg:sha:*', 'COUNT', 500]]);
      const [next, keys] = res as [string, string[]];
      cursor = next;
      if (keys.length) {
        const lists = await call(keys.map((k) => ['LRANGE', k, 0, -1]));
        const cmds = (lists as string[][]).flat().flatMap((j) => indexCmds(JSON.parse(j) as Registration, j));
        if (cmds.length) await call(cmds);
      }
    } while (cursor !== '0');
    await call([['SET', 'rg:ix:v1', 'done']]);
  }
}

/** Public view of a registration (what lookups return). */
export function publicRegistration(r: Registration) {
  return {
    moonmark: r.moonmark, utc: new Date(Number(BigInt(r.unix_ns) / 1_000_000n)).toISOString(),
    registrant: r.registrant, registrant_verified: r.registrant_verified === true,
    on_behalf_of: r.on_behalf_of, label: r.label, signed_url: r.signed_url,
    statement: r,
  };
}
