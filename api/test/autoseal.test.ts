import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { Signer } from '../src/receipt';
import { memoryStore, record, sealDue, sealIsDue, sealIfDue, luneOf, luneStartNs, luneEndNs } from '../src/tideline';
import { formatMoonmark, toMoon } from '../src/moon';
import { autoSeal, resetAutoSeal, AUTO_SEAL_EVERY_MS, type Env } from '../src/index';

const signer = new Signer(generateKeyPairSync('ed25519').privateKey);
const l0 = luneOf(1_794_682_325_000_000_000n);
const signAt = (ns: bigint, i: number) => signer.sign(String(i % 10).repeat(64), formatMoonmark(toMoon(ns)), ns, null);

describe('auto-seal', () => {
  it('is due only once a lune with receipts has ended', async () => {
    const store = memoryStore();
    expect(await sealIsDue(store, luneEndNs(l0) + 1n)).toBe(false);
    await record(store, signAt(luneStartNs(l0) + 5n, 1));
    expect(await sealIsDue(store, luneEndNs(l0) - 1n)).toBe(false);
    expect(await sealIsDue(store, luneEndNs(l0))).toBe(true);
    expect((await sealIfDue(store, signer, luneEndNs(l0) - 1n)).length).toBe(0);
    expect((await sealIfDue(store, signer, luneEndNs(l0) + 1n)).map((t) => t.size)).toEqual([1]);
    expect(await sealIsDue(store, luneEndNs(l0) + 1n)).toBe(false);
  });

  it('two runs at once keep one tide and an unbroken chain', async () => {
    const store = memoryStore();
    await record(store, signAt(luneStartNs(l0) + 5n, 1));
    await record(store, signAt(luneStartNs(l0 + 1) + 5n, 2));
    const now = luneEndNs(l0 + 1) + 1n;
    await Promise.all([sealDue(store, signer, now), sealDue(store, signer, now + 7n)]);
    const a = await store.getTide(l0), b = await store.getTide(l0 + 1);
    expect(b?.prev).toBe(a?.hash);
  });

  it('checks at most once a minute per instance', () => {
    resetAutoSeal();
    const deferred: unknown[] = [];
    const env = { TIDES: memoryStore(), SIGNER: signer, DEFER: (p: Promise<unknown>) => { deferred.push(p); } } as unknown as Env;
    expect(autoSeal(env, 1_000_000)).toBe(true);
    expect(autoSeal(env, 1_000_000 + AUTO_SEAL_EVERY_MS - 1)).toBe(false);
    expect(autoSeal(env, 1_000_000 + AUTO_SEAL_EVERY_MS)).toBe(true);
    expect(deferred.length).toBe(2);
    expect(autoSeal({} as Env, 9e12)).toBe(false);
  });
});
