/**
 * Edition registry for certificates of authenticity.
 *
 * An artist signs one moon-coa/1 statement for a whole edition (artist, title, year, edition size, master file).
 * Registering it gives every print its own random print ID. Each certificate's QR code carries its print number
 * and ID, so a scan can confirm "print 3 of 25" is a real print of this edition, and shows how many times that
 * print's certificate has been checked. A print number can't be invented or changed. An exact copy of a real
 * certificate still carries a real ID: its check count and first check date are what give it away.
 *
 *   ed:<statement sha256>          -> { n, ids[], created, moonmark }      (written once)
 *   ed:<statement sha256>:<print>  -> hash { count, first }               (scan history)
 */
import { createHash, randomBytes } from 'node:crypto';

export interface Edition { n: number; ids: string[]; created: string; moonmark: string }
export interface EditionStore {
  /** Store the edition if none is stored yet. Returns the stored one either way. */
  put(sha: string, ed: Edition): Promise<Edition>;
  get(sha: string): Promise<Edition | null>;
  /** Count one check of a print. Returns the new count and the first check time. */
  hit(sha: string, print: number, at: string): Promise<{ count: number; first: string }>;
}

export const newPrintIds = (n: number) => Array.from({ length: n }, () => randomBytes(8).toString('base64url'));

/** Read a moon-coa/1 statement. Returns null unless it is well formed. */
export function parseStatement(text: string): { artist: string; title: string; year: string; edition: number | null; master: string } | null {
  const lines = text.split('\n');
  if (lines.length !== 6 || lines[0] !== 'moon-coa/1') return null;
  const get = (i: number, k: string) => (lines[i].startsWith(k + ':') ? lines[i].slice(k.length + 1) : null);
  const artist = get(1, 'artist'), title = get(2, 'title'), year = get(3, 'year'), ed = get(4, 'edition'), master = get(5, 'master');
  if (!artist || !title || !year || !ed || !master || !/^[0-9a-f]{64}$/.test(master)) return null;
  if (ed === 'unique') return { artist, title, year, edition: null, master };
  if (!/^\d{1,3}$/.test(ed) || +ed < 2 || +ed > 100) return null;
  return { artist, title, year, edition: +ed, master };
}

export const statementSha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export function memoryEditions(): EditionStore {
  const eds = new Map<string, Edition>(), hits = new Map<string, { count: number; first: string }>();
  return {
    async put(sha, ed) { if (!eds.has(sha)) eds.set(sha, ed); return eds.get(sha)!; },
    async get(sha) { return eds.get(sha) ?? null; },
    async hit(sha, print, at) {
      const k = `${sha}:${print}`, h = hits.get(k) ?? { count: 0, first: at };
      h.count++; hits.set(k, h); return { ...h };
    },
  };
}

export function upstashEditions(url: string, token: string): EditionStore {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!r.ok) throw new Error('editions ' + r.status);
    const j = (await r.json()) as { result?: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  const get = async (sha: string) => { const r = (await call(['GET', `ed:${sha}`])) as string | null; return r ? (JSON.parse(r) as Edition) : null; };
  return {
    async put(sha, ed) { await call(['SET', `ed:${sha}`, JSON.stringify(ed), 'NX']); return (await get(sha))!; },
    get,
    async hit(sha, print, at) {
      const k = `ed:${sha}:${print}`;
      await call(['HSETNX', k, 'first', at]);
      const count = Number(await call(['HINCRBY', k, 'count', 1]));
      const first = String(await call(['HGET', k, 'first']));
      return { count, first };
    },
  };
}
