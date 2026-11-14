/**
 * drand quicknet: public randomness from the League of Entropy, a new value every 3 seconds.
 * No one can know a round's value before it is published, so a receipt that includes it
 * was provably signed after that round. Every value is a BLS signature anyone can check
 * offline against the network's public key, so Moon can't invent one.
 */
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const BEACON_NETWORK = 'drand-quicknet';
export const QUICKNET = {
  hash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
  public_key: '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
  period: 3,
  genesis_time: 1692803367,
  scheme: 'bls-unchained-g1-rfc9380',
  relays: ['https://api.drand.sh', 'https://drand.cloudflare.com', 'https://api2.drand.sh'],
} as const;
const DST = 'BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_';

export interface Beacon { network: typeof BEACON_NETWORK; round: number; signature: string }

const hexBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Unix nanoseconds at which a round's value is first published. */
export interface Chain { public_key: string; period: number; genesis_time: number }

export const roundTimeNs = (round: number, chain: Chain = QUICKNET): bigint =>
  (BigInt(chain.genesis_time) + BigInt(round - 1) * BigInt(chain.period)) * 1_000_000_000n;

/** The round being published at a Unix time (ns). */
export const roundAt = (unixNs: bigint): number =>
  Number((unixNs / 1_000_000_000n - BigInt(QUICKNET.genesis_time)) / BigInt(QUICKNET.period)) + 1;

/** The beacon's random value: SHA-256 of its signature. */
export const beaconRandomness = (signatureHex: string): string => toHex(sha256(hexBytes(signatureHex)));

const PKS = new Map<string, ReturnType<typeof bls.G2.Point.fromHex>>();
/** Check a quicknet round against the League of Entropy public key. Pure and offline. */
export function verifyBeacon(b: { round: unknown; signature: unknown }, chain: Chain = QUICKNET): boolean {
  if (!Number.isSafeInteger(b.round) || (b.round as number) < 1 || typeof b.signature !== 'string' || !/^[0-9a-f]{96}$/.test(b.signature)) return false;
  try {
    let PK = PKS.get(chain.public_key);
    if (!PK) { PK = bls.G2.Point.fromHex(chain.public_key); PKS.set(chain.public_key, PK); }
    const msg = new Uint8Array(8);
    new DataView(msg.buffer).setBigUint64(0, BigInt(b.round as number));
    const ss = bls.shortSignatures;
    return ss.verify(ss.Signature.fromHex(b.signature), ss.hash(sha256(msg), DST), PK);
  } catch { return false; }
}

/**
 * Latest quicknet round from the public relays, checked before use.
 * Cached per round, so at most one fetch every 3 seconds. Returns null if no relay answers in time.
 */
export function beaconSource(fetchImpl: typeof fetch = fetch, timeoutMs = 900) {
  let cache: Beacon | null = null;
  return async (nowNs: bigint): Promise<Beacon | null> => {
    const want = roundAt(nowNs);
    if (cache && cache.round >= want) return cache;
    for (const base of QUICKNET.relays) {
      try {
        const r = await fetchImpl(`${base}/${QUICKNET.hash}/public/latest`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) continue;
        const j = (await r.json()) as { round?: number; signature?: string };
        const b: Beacon = { network: BEACON_NETWORK, round: Number(j.round), signature: String(j.signature ?? '').toLowerCase() };
        if (!verifyBeacon(b) || roundTimeNs(b.round) > nowNs + 5_000_000_000n) continue;
        if (!cache || b.round > cache.round) cache = b;
        return cache;
      } catch { /* next relay */ }
    }
    return cache && roundTimeNs(cache.round) > nowNs - 30_000_000_000n ? cache : null;
  };
}
