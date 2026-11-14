import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { Signer } from '../../../api/src/receipt.js';
import * as api from '../../../api/src/moon.js';
import { moonmark, moon, fromMoonmark, moonmarkToDate, moonmarkUrl, moonPhase, toNs, nowNs, verify, fingerprint } from '../src/index.js';

describe('same math as the API', () => {
  it('src/moon.ts is an exact copy of the API reference', () => {
    const a = readFileSync(new URL('../../../api/src/moon.ts', import.meta.url), 'utf8');
    const b = readFileSync(new URL('../src/moon.ts', import.meta.url), 'utf8');
    expect(b).toBe(a);
  });
  it('matches the API for random moments', () => {
    for (let i = 0; i < 500; i++) {
      const ns = BigInt(Math.floor(Math.random() * 4e18)) - 2_000_000_000_000_000_000n;
      expect(moonmark(ns)).toBe(api.formatMoonmark(api.toMoon(ns)));
    }
  });
});

describe('moonmarks', () => {
  it('round-trips to the nanosecond', () => {
    const ns = 1_794_682_325_123_456_789n;
    const mk = moonmark(ns);
    expect(mk).toMatch(/^\d+\.\d\d\.\d\d \d\d:\d\d:\d\d\.\d{9}$/);
    const back = fromMoonmark(mk);
    expect(moonmark(back)).toBe(mk);
    expect(back <= ns && ns - back < 2n).toBe(true);
  });
  it('accepts Date, ms, ISO string and the URL form', () => {
    const d = new Date('2026-11-14T12:00:00Z');
    expect(moonmark(d)).toBe(moonmark(d.getTime()));
    expect(moonmark(d)).toBe(moonmark('2026-11-14T12:00:00Z'));
    const mk = moonmark(d);
    expect(fromMoonmark(mk.replace(' ', '-').replace(/:/g, '.'))).toBe(fromMoonmark(mk));
    expect(moonmarkToDate(mk).getTime()).toBe(d.getTime());
    expect(moonmarkUrl(mk)).toBe('https://moon369.org/m/' + mk.replace(' ', '-').replace(/:/g, '.'));
  });
  it('now is close to Date.now', () => {
    expect(Number(nowNs() / 1_000_000n) - Date.now()).toBeLessThan(50);
    expect(moon().year).toBeGreaterThan(1900);
  });
  it('rejects bad input', () => {
    expect(() => toNs('not a date')).toThrow();
    expect(() => fromMoonmark('1928.14.01')).toThrow();
  });
  it('moon phase', () => {
    const p = moonPhase('2026-11-14T12:00:00Z');
    expect(p.illumination).toBeGreaterThanOrEqual(0);
    expect(p.illumination).toBeLessThanOrEqual(1);
    expect(typeof p.name).toBe('string');
  });
});

describe('signed Moonmarks', () => {
  const signer = new Signer(generateKeyPairSync('ed25519').privateKey);
  const info = signer.info();
  const keys = { [info.key_id]: info.public_key };

  it('fingerprint is SHA-256 hex', async () => {
    expect(await fingerprint('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await fingerprint(new TextEncoder().encode('abc'))).toBe(await fingerprint('abc'));
    expect(await fingerprint(new Blob(['abc']))).toBe(await fingerprint('abc'));
  });

  it('verifies a receipt Moon signed, offline', async () => {
    const sha = await fingerprint('hello moon');
    const ns = 1_794_682_325_123_456_789n;
    const r = signer.sign(sha, api.formatMoonmark(api.toMoon(ns)), ns);
    const out = await verify(r, { keys });
    expect(out).toMatchObject({ valid: true, moonmark: r.moonmark, key_id: info.key_id });
    expect(await verify(r, { keys, content: 'hello moon' })).toMatchObject({ valid: true });
    expect(await verify(r, { keys, content: 'hello sun' })).toEqual({ valid: false, reason: 'content_mismatch' });
    expect(await verify(r, { keys, sha256: sha.toUpperCase() })).toMatchObject({ valid: true });
  });

  it('catches tampering', async () => {
    const ns = 1_794_682_325_123_456_789n;
    const r = signer.sign('a'.repeat(64), api.formatMoonmark(api.toMoon(ns)), ns);
    expect(await verify({ ...r, sha256: 'b'.repeat(64) }, { keys })).toEqual({ valid: false, reason: 'bad_signature' });
    expect(await verify({ ...r, unix_ns: (ns + 1n).toString() }, { keys })).toEqual({ valid: false, reason: 'bad_signature' });
    expect(await verify(r, { keys: {} })).toEqual({ valid: false, reason: 'unknown_key' });
    expect(await verify({ ...r, receipt: 'x' }, { keys })).toEqual({ valid: false, reason: 'unknown_version' });
    expect(await verify(null, { keys })).toEqual({ valid: false, reason: 'not_a_receipt' });
    const forged = signer.sign('a'.repeat(64), '1928.01.01 00:00:00.000000000', ns);
    expect(await verify(forged, { keys })).toEqual({ valid: false, reason: 'moonmark_mismatch' });
  });
});
