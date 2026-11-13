import { describe, it, expect } from 'vitest';
import {
  EPOCH_UNIX_NS, LUNATION_NS, NUM, DEN, MOON_SECOND_SI, toMoon, toUnixNs, unixNsToMoonNs, moonNsToUnixNs,
  formatMoonmark, parseMoonmark, moonmarkPath, moonLength, yearInfo, phase, truePhase, illumination, MoonRangeError, unixNsToIso,
} from '../src/moon';

const ms = (n: number) => BigInt(n) * 1_000_000n;

describe('constants', () => {
  it('epoch is the first mean new moon of 0 AD', () => {
    expect(EPOCH_UNIX_NS).toBe(-62_165_308_562_978_611_200n);
    expect(unixNsToIso(EPOCH_UNIX_NS)).toBe('0000-01-23T02:43:57.021388800Z');
  });
  it('Moon second matches the spec value', () => {
    expect(MOON_SECOND_SI).toBeCloseTo(1.0403730490216803, 15);
    expect(NUM).toBe(31_881_600_000_000_000n);
    expect(DEN).toBe(33_168_757_399_689_600n);
  });
  it('13 moons sum to 369 days with five 29-day moons', () => {
    const lens = Array.from({ length: 13 }, (_, i) => moonLength(i + 1));
    expect(lens).toEqual([29, 28, 29, 28, 28, 29, 28, 29, 28, 28, 29, 28, 28]);
    expect(lens.reduce((a, b) => a + b, 0)).toBe(369);
  });
});

describe('conversion', () => {
  it('epoch is Year 0, Moon 1, Day 1, 00:00:00', () => {
    const t = toMoon(EPOCH_UNIX_NS);
    expect([t.year, t.moon, t.day, t.hour, t.minute, t.second, t.nanosecond]).toEqual([0, 1, 1, 0, 0, 0, 0]);
  });

  it('one Moon year after the epoch is exactly 13 lunations', () => {
    const y1 = toUnixNs({ year: 1, moon: 1, day: 1 });
    expect(y1 - EPOCH_UNIX_NS).toBe(13n * LUNATION_NS);
  });

  it('the 2000-01-06 18:14 UTC reference new moon falls exactly on a moon boundary', () => {
    const ref = ms(Date.UTC(2000, 0, 6, 18, 14));
    // the epoch is defined 24,736 whole lunations before it
    expect((ref - EPOCH_UNIX_NS) % LUNATION_NS).toBe(0n);
  });

  it('matches the live site for 2026-11-12', () => {
    const t = toMoon(ms(Date.UTC(2026, 10, 12, 18, 36, 46, 63)));
    expect([t.year, t.moon, t.day]).toEqual([1928, 5, 3]);
    expect([t.hour, t.minute]).toEqual([6, 54]);
  });

  it('matches the documented Moonmark example', () => {
    expect(formatMoonmark(toMoon(1_794_516_299_901_000_000n))).toBe('1928.05.03 08:57:39.035909351');
  });

  it('round-trips Moon -> Unix -> Moon exactly, including nanoseconds', () => {
    const samples = [
      { year: 0, moon: 1, day: 1 },
      { year: 1928, moon: 5, day: 3, hour: 8, minute: 57, second: 39, nanosecond: 35_909_351 },
      { year: 1928, moon: 13, day: 28, hour: 23, minute: 59, second: 59, nanosecond: 999_999_999 },
      { year: 2500, moon: 11, day: 29, hour: 12 },
      { year: -50, moon: 3, day: 29, hour: 1, minute: 2, second: 3, nanosecond: 4 },
    ];
    for (const s of samples) {
      const t = toMoon(toUnixNs(s));
      expect([t.year, t.moon, t.day, t.hour, t.minute, t.second, t.nanosecond])
        .toEqual([s.year, s.moon, s.day, s.hour ?? 0, s.minute ?? 0, s.second ?? 0, s.nanosecond ?? 0]);
    }
  });

  it('round-trips Unix -> Moon -> Unix within one SI nanosecond', () => {
    for (const u of [0n, 1_794_517_059_035_909_351n, -1n, 253_402_300_799_999_999_999n]) {
      const back = moonNsToUnixNs(unixNsToMoonNs(u));
      expect(u - back >= 0n && u - back <= 1n).toBe(true);
    }
  });

  it('is monotonic across day and year boundaries', () => {
    const start = toUnixNs({ year: 1928, moon: 13, day: 28, hour: 23, minute: 59, second: 59 });
    let prev = toMoon(start).moonNs;
    for (let i = 1n; i < 3_000_000_000n; i += 7_919_191n) {
      const cur = toMoon(start + i).moonNs;
      expect(cur >= prev).toBe(true);
      prev = cur;
    }
    expect(toMoon(start + 2_100_000_000n).year).toBe(1929);
  });
});

describe('formatting and validation', () => {
  it('parses Moonmarks, including the URL form', () => {
    expect(parseMoonmark('1928.05.03-08.57.39.035909351')).toEqual(parseMoonmark('1928.05.03 08:57:39.035909351'));
    expect(moonmarkPath('1928.05.03 08:57:39.035909351')).toBe('1928.05.03-08.57.39.035909351');
    expect(parseMoonmark('1928.05.03 08:57:39.035909351')).toEqual({ year: 1928, moon: 5, day: 3, hour: 8, minute: 57, second: 39, nanosecond: 35_909_351 });
    expect(parseMoonmark('1928.5.3')).toEqual({ year: 1928, moon: 5, day: 3, hour: 0, minute: 0, second: 0, nanosecond: 0 });
  });
  it('rejects impossible dates', () => {
    expect(() => toUnixNs({ year: 1928, moon: 2, day: 29 })).toThrow(MoonRangeError);
    expect(() => toUnixNs({ year: 1928, moon: 14, day: 1 })).toThrow(MoonRangeError);
    expect(() => toUnixNs({ year: 1928, moon: 1, day: 1, hour: 24 })).toThrow(MoonRangeError);
  });
});

describe('year and phase', () => {
  it('year 1928 has 13 moons starting in sequence', () => {
    const y = yearInfo(1928);
    expect(y.moons).toHaveLength(13);
    expect(y.moons[0].starts_utc.startsWith('2026-07-14')).toBe(true);
    expect(y.ends_utc.startsWith('2027-08-02')).toBe(true);
  });
  it('phase is 0 at the epoch and ~0.5 half a moon later', () => {
    expect(phase(0n)).toBe(0);
    const half = (369n * 86_400n * 1_000_000_000n) / 26n;
    expect(phase(half)).toBeCloseTo(0.5, 9);
  });
  it('true phase matches published new, quarter and full moons (Nov 2026)', () => {
    const at = (iso: string) => BigInt(Date.parse(iso)) * 1_000_000n;
    const off = (f: number, target: number) => Math.abs(((f - target + 1.5) % 1) - 0.5);
    const tol = 20 / (29.53 * 1440); // 20 minutes of lunation
    expect(off(truePhase(at('2026-11-09T07:02:00Z')), 0)).toBeLessThan(tol);
    expect(off(truePhase(at('2026-11-17T11:47:00Z')), 0.25)).toBeLessThan(tol);
    expect(off(truePhase(at('2026-11-24T14:53:00Z')), 0.5)).toBeLessThan(tol);
    expect(off(truePhase(at('2026-11-01T20:28:00Z')), 0.75)).toBeLessThan(tol);
    expect(off(truePhase(at('2000-01-06T18:14:00Z')), 0)).toBeLessThan(tol);
  });
  it('illumination is 0 at new moon and 1 at full moon', () => {
    expect(illumination(BigInt(Date.parse('2026-11-09T07:02:00Z')) * 1_000_000n)).toBeLessThan(0.001);
    expect(illumination(BigInt(Date.parse('2026-11-24T14:53:00Z')) * 1_000_000n)).toBeGreaterThan(0.999);
  });
});
