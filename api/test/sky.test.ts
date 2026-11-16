import { describe, it, expect } from 'vitest';
import { skyAt, moonDistanceKm } from '../src/moon.js';
import { shareSvg } from '../src/card.js';

const ns = (iso: string) => BigInt(Date.parse(iso)) * 1_000_000n;

describe('sky at a Moonmark', () => {
  it('matches a reference ephemeris for distance to within 500 km', () => {
    // astronomy-engine 2.1.19, geocentric distance
    for (const [iso, km] of [['2026-11-24T14:50:00Z', 360760], ['2026-11-16T21:00:00Z', 399976], ['2026-11-12T08:00:00Z', 404639]] as const) {
      expect(Math.abs(moonDistanceKm(ns(iso)) - km)).toBeLessThan(500);
    }
  });
  it('calls the Nov 24, 2026 full moon a supermoon with a king tide', () => {
    const s = skyAt(ns('2026-11-24T14:50:00Z'));
    expect(s.phase.name).toBe('Full moon');
    expect(s.distance.supermoon).toBe(true);
    expect(s.tide.strength).toBe('king');
    expect(s.tilt.fully_lit).toBe(true);
  });
  it('gives neap tides near a quarter moon and medium between', () => {
    expect(skyAt(ns('2026-11-17T08:00:00Z')).tide.strength).toBe('neap');
    expect(skyAt(ns('2026-11-13T12:00:00Z')).tide.strength).toBe('medium');
    expect(skyAt(ns('2026-11-09T05:00:00Z')).tide.strength).toMatch(/spring|king/);
  });
  it('puts the sky on the share card', () => {
    const sky = skyAt(ns('2026-11-24T14:50:00Z'));
    const svg = shareSvg({ year: 1928, moon: 5, lune: 14, lunesInMoon: 28, fraction: 0.5, illumination: 0.998, name: 'Full moon', time: '16:05:51', ns: '000000000', sky });
    expect(svg).toContain('TIDES');
    expect(svg).toContain('KING');
    expect(svg).not.toContain('CYCLE');
  });
});
