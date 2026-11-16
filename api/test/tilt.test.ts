import { describe, it, expect } from 'vitest';
import { limbAngle, moonTilt } from '../src/moon.js';
import { moonSvg } from '../src/card.js';

// Reference: astronomy-engine 2.1.19, geocentric apparent RA/Dec, bright limb position angle.
const REF: [string, number][] = [
  ['2026-11-12T08:00:00Z', 278.6],
  ['2026-11-16T21:00:00Z', 252.5],
  ['2026-11-29T03:00:00Z', 104.8],
];
const ns = (iso: string) => BigInt(Date.parse(iso)) * 1_000_000n;

describe('moon tilt', () => {
  it('matches a reference ephemeris to within 2.5 degrees', () => {
    for (const [iso, pa] of REF) {
      const d = Math.abs(limbAngle(ns(iso)) - pa);
      expect(Math.min(d, 360 - d)).toBeLessThan(2.5);
    }
  });
  it('turns a waxing moon from lit-right toward the Sun', () => {
    // limb angle near 270 (lit side due west) means almost no turn
    expect(Math.abs(moonTilt(ns('2026-11-12T08:00:00Z')))).toBeLessThan(15);
    expect(moonTilt(ns('2026-11-16T21:00:00Z'))).toBeGreaterThan(10);
  });
  it('rotates the drawing only when asked', () => {
    expect(moonSvg(0.2, 50, 'a')).not.toContain('rotate(');
    expect(moonSvg(0.2, 50, 'a', 17.7)).toContain('rotate(17.7)');
  });
});
