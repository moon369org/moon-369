import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { verifyBeacon, roundTimeNs, roundAt, beaconRandomness, beaconSource, QUICKNET, type Chain } from '../src/beacon';
import { Signer, verifyReceipt } from '../src/receipt';
import { handle, type Env } from '../src/index';
import { formatMoonmark, toMoon } from '../src/moon';

// drand's own test beacon (drand-client test suite): same scheme as quicknet, different group key.
const CHAIN: Chain = {
  public_key: '81d320f220ee9c79e60e19dedc838c31e3ab919b15481e9feb52f643628c4f6a13fdc52129493875a818109d767272ca0541cbcdcea9335f2870d781b39b845ba8cbd44fdfe4967781cf72ca5917fc9398bcf97ca0548ed5a709016c4b1ff0f3',
  period: 3, genesis_time: 1687506816,
};
const B = { network: 'drand-quicknet' as const, round: 38, signature: '95c93585c513ebbcb4777ff15599b3140e5ec0295faa0e483f3deadd88fa6d43f0d3703e3a4ce106e8fd6c6987f32126' };
const ROUND_NS = roundTimeNs(38, CHAIN);

describe('drand beacon', () => {
  it('verifies a real beacon and rejects tampering', () => {
    expect(verifyBeacon(B, CHAIN)).toBe(true);
    expect(verifyBeacon({ ...B, round: 39 }, CHAIN)).toBe(false);
    expect(verifyBeacon({ ...B, signature: B.signature.replace(/.$/, '7') }, CHAIN)).toBe(false);
    expect(verifyBeacon(B)).toBe(false); // wrong network key
    expect(beaconRandomness(B.signature)).toBe('b2fc21325a24904a6a9e81a6c63f65f6cec3f0b2400df3f4a56b214770e9ccca');
  });
  it('round timing matches the quicknet schedule', () => {
    expect(roundTimeNs(1)).toBe(BigInt(QUICKNET.genesis_time) * 1_000_000_000n);
    expect(roundAt(roundTimeNs(1000))).toBe(1000);
    expect(roundAt(roundTimeNs(1000) + 2_999_999_999n)).toBe(1000);
  });
});

describe('v2 receipts', () => {
  const signer = new Signer(generateKeyPairSync('ed25519').privateKey);
  const keys = { [signer.keyId]: signer.info().public_key };
  const ns = ROUND_NS + 1_500_000_000n;
  const mark = formatMoonmark(toMoon(ns));

  it('signs the beacon and verifies it offline', () => {
    const r = signer.sign('a'.repeat(64), mark, ns, B);
    expect(r.receipt).toBe('moonmark-receipt/2');
    expect(verifyReceipt(r, keys, CHAIN)).toEqual({ valid: true, not_before_unix_ns: ROUND_NS.toString(), beacon_round: 38 });
  });
  it('catches a swapped, fake or future beacon', () => {
    const r = signer.sign('a'.repeat(64), mark, ns, B);
    expect(verifyReceipt({ ...r, beacon: { ...B, round: 39 } }, keys, CHAIN).reason).toBe('bad_signature');
    const fake = signer.sign('a'.repeat(64), mark, ns, { ...B, round: 39 });
    expect(verifyReceipt(fake, keys, CHAIN).reason).toBe('bad_beacon');
    const early = ROUND_NS - 60_000_000_000n;
    const backdated = signer.sign('a'.repeat(64), formatMoonmark(toMoon(early)), early, B);
    expect(verifyReceipt(backdated, keys, CHAIN).reason).toBe('beacon_after_moment');
    expect(verifyReceipt({ ...r, beacon: undefined }, keys, CHAIN).reason).toBe('malformed');
  });
  it('v1 receipts still verify', () => {
    const r = signer.sign('a'.repeat(64), mark, ns);
    expect(r.receipt).toBe('moonmark-receipt/1');
    expect(verifyReceipt(r, keys)).toEqual({ valid: true });
  });
  it('/v1/sign uses the beacon and /v1/verify reports not_before', async () => {
    const env: Env = { SIGNER: signer, BEACON: async () => B, BEACON_CHAIN: CHAIN };
    const s: any = await (await handle(new Request('https://api.example.org/v1/sign', { method: 'POST', body: JSON.stringify({ sha256: 'b'.repeat(64) }) }), env)).json();
    expect(s.receipt.receipt).toBe('moonmark-receipt/2');
    expect(s.receipt.beacon).toEqual(B);
    expect(s.signed_url).toContain('&r=38&b=' + B.signature);
    const v: any = await (await handle(new Request('https://api.example.org/v1/verify', { method: 'POST', body: JSON.stringify({ receipt: s.receipt }) }), env)).json();
    expect(v.valid).toBe(true);
    expect(v.not_before).toMatchObject({ round: 38, beacon: 'drand-quicknet', unix_ns: ROUND_NS.toString() });
  });
  it('falls back to v1 when no beacon is available', async () => {
    const env: Env = { SIGNER: signer, BEACON: async () => null };
    const s: any = await (await handle(new Request('https://api.example.org/v1/sign', { method: 'POST', body: JSON.stringify({ sha256: 'b'.repeat(64) }) }), env)).json();
    expect(s.receipt.receipt).toBe('moonmark-receipt/1');
  });
});

describe('beacon source', () => {
  it('rejects a relay answer that fails the BLS check and tries the next relay', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => { calls.push(url); return new Response(JSON.stringify({ round: 38, signature: B.signature })); }) as unknown as typeof fetch;
    const get = beaconSource(fake);
    expect(await get(roundTimeNs(40))).toBeNull(); // B is not a quicknet beacon, so every relay is rejected
    expect(calls.length).toBe(QUICKNET.relays.length);
  });
});
