/**
 * Customer API keys. Only the SHA-256 of each key is stored, never the key itself,
 * so a leaked key list can't be used to call the API.
 *
 * MOON_API_KEYS (env) is JSON: { "<sha256 hex of key>": { "owner": "...", "plan": "pro", "per_min": 1000 } }
 * Set "active": false to switch a key off without deleting it.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { KeyStore } from './index.js';

export interface KeyRecord { owner?: string; plan?: string; per_min?: number; active?: boolean; note?: string }

export const KEY_PREFIX = 'moon_';
export const hashKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');
export const newKey = () => KEY_PREFIX + randomBytes(24).toString('base64url');

/** Key store backed by a JSON object of hashed keys (the MOON_API_KEYS env var). */
export function envKeyStore(json: string): KeyStore {
  const map = JSON.parse(json) as Record<string, KeyRecord>;
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('MOON_API_KEYS must be a JSON object');
  return { async get(hash) { const r = map[hash.toLowerCase()]; return r ? JSON.stringify(r) : null; } };
}
