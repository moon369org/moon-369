/**
 * moon369: Moon time, offline.
 * Convert any moment to a Moonmark and back, read the moon's phase, and verify signed Moonmarks.
 * Exact to the nanosecond, the same answer as api.moon369.org, with no network calls (except fetchKeys).
 */
import {
  toMoon, toUnixNs, formatMoonmark, parseMoonmark, moonmarkPath, truePhase, illumination as illum, phaseName,
  yearInfo, unixNsToIso, moonLength,
  SPEC_VERSION, EPOCH_UNIX_NS, MOON_SECOND_SI, YEAR_DAYS, MOONS, MoonRangeError,
  type MoonTime, type MoonInput,
} from './moon.js';

export {
  toMoon, toUnixNs, formatMoonmark, parseMoonmark, moonmarkPath, yearInfo, unixNsToIso, moonLength, phaseName,
  SPEC_VERSION, EPOCH_UNIX_NS, MOON_SECOND_SI, YEAR_DAYS, MOONS, MoonRangeError,
  type MoonTime, type MoonInput,
};
export { verify, verifyBeacon, beaconRoundTime, fingerprint, fetchKeys, signedBytes, RECEIPT_VERSION, RECEIPT_V1, RECEIPT_V2, RECEIPT_V3, PQ_ALG, QUICKNET, KEYS_URL, type Receipt, type Beacon, type BeaconChain, type KeySet, type VerifyResult, type VerifyOptions } from './receipt.js';

/** A moment: a Date, Unix milliseconds (number), Unix nanoseconds (bigint), or an ISO string. Default: now. */
export type Moment = Date | number | bigint | string;

/** Current time as Unix nanoseconds, using the best clock available. */
export function nowNs(): bigint {
  const p = (globalThis as { performance?: { timeOrigin?: number; now(): number } }).performance;
  if (p && typeof p.timeOrigin === 'number') {
    const ms = p.timeOrigin + p.now();
    const whole = Math.floor(ms);
    return BigInt(whole) * 1_000_000n + BigInt(Math.floor((ms - whole) * 1e6));
  }
  return BigInt(Date.now()) * 1_000_000n;
}

/** Any Moment to Unix nanoseconds. */
export function toNs(m: Moment = nowNs()): bigint {
  if (typeof m === 'bigint') return m;
  if (typeof m === 'number') { if (!Number.isFinite(m)) throw new MoonRangeError('invalid time'); return BigInt(Math.floor(m)) * 1_000_000n; }
  const ms = m instanceof Date ? m.getTime() : Date.parse(m);
  if (!Number.isFinite(ms)) throw new MoonRangeError('invalid time');
  return BigInt(ms) * 1_000_000n;
}

/** The Moonmark for a moment: "YEAR.MM.DD HH:MM:SS.NNNNNNNNN". */
export const moonmark = (m?: Moment): string => formatMoonmark(toMoon(toNs(m)));

/** The Moon date and time for a moment. */
export const moon = (m?: Moment): MoonTime => toMoon(toNs(m));

/** A Moonmark (either form) back to Unix nanoseconds. */
export const fromMoonmark = (mark: string): bigint => toUnixNs(parseMoonmark(mark));

/** A Moonmark back to a Date (millisecond precision). */
export const moonmarkToDate = (mark: string): Date => new Date(Number(fromMoonmark(mark) / 1_000_000n));

/** The public link for a Moonmark. */
export const moonmarkUrl = (mark: string): string => 'https://moon369.org/m/' + moonmarkPath(mark);

/** The moon at a moment: phase (0 new, 0.5 full), share of the disc lit (0 to 1) and its name. */
export function moonPhase(m?: Moment): { phase: number; illumination: number; name: string } {
  const ns = toNs(m);
  const f = truePhase(ns);
  return { phase: f, illumination: illum(ns), name: phaseName(f) };
}
