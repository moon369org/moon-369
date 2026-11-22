import { describe, it, expect } from 'vitest';
import { fullMoonIndexAfter, fullMoonMs, fullMoonsInMonth, publicFullMoon } from '../src/fullmoons.js';

// Reference instants from PyEphem 4.2.1 (ephem.next_full_moon), UTC.
const REF: [string, string][] = [
  ['2000-01-21T04:40:27Z', 'Jan 2000 eclipse'], ['2024-12-15T09:01:38Z', 'Dec 2024'], ['1969-07-29T02:44:59Z', 'after Apollo 11'],
  ['2028-12-31T16:48:25Z', 'Dec 2028'], ['2026-05-01T17:23:07Z', 'May 2026'], ['2026-05-31T08:45:08Z', 'May 2026 blue moon'],
];

describe('full moons', () => {
  it('match published full moons to within a minute', () => {
    for (const [iso] of REF) {
      const t = Date.parse(iso), k = fullMoonIndexAfter(t - 3 * 86400000);
      expect(Math.abs(fullMoonMs(k) - t)).toBeLessThan(60_000);
    }
  });
  it('gives the next full moon at or after a moment', () => {
    const t = Date.parse('2026-11-22T00:00:00Z'), f = publicFullMoon(fullMoonIndexAfter(t));
    expect(f.utc.slice(0, 16)).toBe('2026-11-24T14:53');
    expect(f.supermoon).toBe(true);
    expect(f.illumination).toBeGreaterThan(99.5);
    expect(f.moonmark).toMatch(/^1928\.05\.14 /);
  });
  it('finds two full moons in a blue-moon month', () => {
    expect(fullMoonsInMonth(2026, 5).length).toBe(2);
    expect(fullMoonsInMonth(2026, 2).length).toBe(1);
  });
  it('lists full moons in order, a lunation apart', () => {
    let k = fullMoonIndexAfter(Date.parse('2030-01-01T00:00:00Z'));
    for (let i = 0; i < 30; i++, k++) { const d = (fullMoonMs(k + 1) - fullMoonMs(k)) / 86400000; expect(d).toBeGreaterThan(29.2); expect(d).toBeLessThan(29.9); }
  });
});
