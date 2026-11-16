import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { handle } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { memoryStore, record } from '../src/tideline.js';
import { toMoon, formatMoonmark } from '../src/moon.js';

const signer = new Signer(generateKeyPairSync('ed25519').privateKey);
const get = (e: object) => handle(new Request('https://x/v1/status'), e as never);

describe('status', () => {
  it('names every part that is missing', async () => {
    const j = await (await get({ SIGNER: signer })).json() as { ok: boolean; problems: string[]; signing: { ok: boolean; keys: unknown[] } };
    expect(j.ok).toBe(false);
    expect(j.signing.ok).toBe(true); expect(j.signing.keys).toHaveLength(1);
    expect(j.problems).toEqual(expect.arrayContaining(['beacon', 'timestamps', 'tideline']));
  });
  it('flags a Tideline that has fallen behind', async () => {
    const TIDES = memoryStore();
    const old = BigInt(Date.now() - 4 * 86_400_000) * 1_000_000n;
    await record(TIDES, signer.sign('ab'.repeat(32), formatMoonmark(toMoon(old)), old));
    const j = await (await get({ SIGNER: signer, TIDES })).json() as { problems: string[]; tideline: { overdue: boolean; waiting_to_seal: number; last_sealed: unknown } };
    expect(j.tideline.overdue).toBe(true); expect(j.tideline.waiting_to_seal).toBeGreaterThan(2); expect(j.tideline.last_sealed).toBe(null);
    expect(j.problems).toContain('tideline_overdue');
  });
});

import { nextSealRun } from '../src/index.js';
describe('next seal run', () => {
  const ns = (iso: string) => BigInt(Date.parse(iso)) * 1_000_000n;
  it('is the next 07:23 UTC after the lune ends', () => {
    expect(nextSealRun(ns('2026-11-16T15:18:00Z'), ns('2026-11-16T18:00:00Z'))).toBe('2026-11-17T07:23:00.000Z');
    expect(nextSealRun(ns('2026-11-17T05:00:00Z'), ns('2026-11-16T18:00:00Z'))).toBe('2026-11-17T07:23:00.000Z');
    expect(nextSealRun(ns('2026-11-17T08:00:00Z'), ns('2026-11-16T18:00:00Z'))).toBe('2026-11-18T07:23:00.000Z');
  });
});
