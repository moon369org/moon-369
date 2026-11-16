/**
 * Re-sealing: give an old receipt a fresh signature before its algorithms age.
 *
 * The fingerprint of a receipt is SHA-256 over "moonmark-reseal/1\n" followed by the receipt as JSON with its keys
 * sorted at every level. Moon signs that fingerprint now, with today's algorithms and beacon, and logs it on the
 * Tideline. The new receipt proves the old one, signatures and all, existed at the new moment, so the chain
 * still holds if the old algorithm is broken later. Re-seal again whenever the algorithms change.
 */
import { createHash } from 'node:crypto';

export const RESEAL = 'moonmark-reseal/1';

/** JSON with keys sorted at every level, no spaces. */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x as object).sort().map((k) => JSON.stringify(k) + ':' + canonical((x as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(x);
}

export const resealFingerprint = (receipt: unknown): string => createHash('sha256').update(RESEAL + '\n' + canonical(receipt), 'utf8').digest('hex');
