/**
 * Customer API keys. Only the SHA-256 of each key is stored, never the key itself,
 * so a leaked key list can't be used to call the API.
 *
 * MOON_API_KEYS (env) is JSON: { "<sha256 hex of key>": { "owner": "...", "plan": "pro", "per_min": 1000 } }
 * Set "active": false to switch a key off without deleting it.
 *
 * Self-serve keys (POST /v1/api-keys) live in Upstash as key:<hash>. They are plan "free" and
 * verified: false: the owner name is whatever the person typed, so Moon never vouches for it.
 * Keys handed out by hand (MOON_API_KEYS) are verified unless they say otherwise.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { KeyStore } from './index.js';

export interface KeyRecord { owner?: string; plan?: string; per_min?: number; active?: boolean; note?: string; verified?: boolean; email?: string; use?: string; created?: string }

/** Where self-serve and admin-issued keys are written. put never overwrites; set does (switching a key off or on). */
export interface KeyWriter { put(hash: string, rec: KeyRecord): Promise<boolean>; set?(hash: string, rec: KeyRecord): Promise<void>; read?(hash: string): Promise<KeyRecord | null> }

export const KEY_PREFIX = 'moon_';
export const hashKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');
export const newKey = () => KEY_PREFIX + randomBytes(24).toString('base64url');

/** Key store backed by a JSON object of hashed keys (the MOON_API_KEYS env var). */
export function envKeyStore(json: string): KeyStore {
  const map = JSON.parse(json) as Record<string, KeyRecord>;
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('MOON_API_KEYS must be a JSON object');
  return { async get(hash) { const r = map[hash.toLowerCase()]; return r ? JSON.stringify(r) : null; } };
}

/** Self-serve keys in Upstash Redis: key:<sha256 of key> -> KeyRecord JSON. */
export function upstashKeyStore(url: string, token: string): KeyStore & KeyWriter {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!r.ok) throw new Error('keys ' + r.status);
    const j = (await r.json()) as { result?: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  return {
    async get(hash) { return ((await call(['GET', `key:${hash.toLowerCase()}`])) as string | null) ?? null; },
    async put(hash, rec) { return (await call(['SET', `key:${hash.toLowerCase()}`, JSON.stringify(rec), 'NX'])) === 'OK'; },
    async set(hash, rec) { await call(['SET', `key:${hash.toLowerCase()}`, JSON.stringify(rec)]); },
    async read(hash) { const r = (await call(['GET', `key:${hash.toLowerCase()}`])) as string | null; return r ? JSON.parse(r) as KeyRecord : null; },
  };
}

/** Self-serve keys in memory (tests and local runs). */
export function memoryKeyStore(): KeyStore & KeyWriter {
  const m = new Map<string, string>();
  return {
    async get(hash) { return m.get(hash.toLowerCase()) ?? null; },
    async put(hash, rec) { if (m.has(hash)) return false; m.set(hash.toLowerCase(), JSON.stringify(rec)); return true; },
    async set(hash, rec) { m.set(hash.toLowerCase(), JSON.stringify(rec)); },
    async read(hash) { const r = m.get(hash.toLowerCase()); return r ? JSON.parse(r) as KeyRecord : null; },
  };
}

/** Look a key up in each store in turn: hand-issued keys first, then self-serve ones. */
export function chainKeyStores(...stores: (KeyStore | undefined)[]): KeyStore | undefined {
  const list = stores.filter(Boolean) as KeyStore[];
  if (!list.length) return undefined;
  return { async get(hash) { for (const s of list) { const r = await s.get(hash).catch(() => null); if (r) return r; } return null; } };
}
