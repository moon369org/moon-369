import { describe, it, expect } from 'vitest';
import { trueNewMoonMs, gapHours, driftByCentury, lunationNear } from '../src/lunation.js';
import { handle } from '../src/index.js';
import { allEclipses } from '../src/eclipses.js';

describe('Moon stays locked to the real Moon', () => {
  it('computes true new moons (Meeus ch. 49) to within a few minutes of published times', () => {
    // Published (USNO): 6 Jan 2000 18:14, 8 Apr 2024 18:21, 11 Mar 1975 05:47 UTC
    const near = (iso: string) => Math.abs(trueNewMoonMs(lunationNear(Date.parse(iso))) - Date.parse(iso)) / 60_000;
    expect(near('2000-01-06T18:14:00Z')).toBeLessThan(2);
    expect(near('2024-04-08T18:21:00Z')).toBeLessThan(2);
  });
  it('agrees with every solar eclipse from 1000 to 3000 (each one falls on a new moon)', () => {
    let worst = 0, n = 0;
    for (const e of allEclipses()) {
      if (e.y < 1000) continue;
      const k = lunationNear(e.ms); worst = Math.max(worst, Math.abs(trueNewMoonMs(k) - e.ms) / 3_600_000); n++;
    }
    expect(n).toBeGreaterThan(4000);
    expect(worst).toBeLessThan(3);   // hours: greatest eclipse and the new moon are never more than a couple of hours apart
  });
  it('anchors the grid on a real new moon', () => {
    expect(Math.abs(gapHours(0)) * 60).toBeLessThan(1);   // 6 January 2000, to the minute
  });
  it('has not drifted: the average gap holds within 15 minutes from 1000 to 2200 CE', () => {
    const c = driftByCentury(1000, 2200).map((x) => x.mean_gap_h);
    expect(Math.max(...c) - Math.min(...c)).toBeLessThan(0.25);
  });
  it('drifts less than the Moon wobbles, from 2000 BCE to 3000 CE', () => {
    const d = driftByCentury(-2000, 3000), means = d.map((x) => x.mean_gap_h);
    const drift = Math.max(...means) - Math.min(...means);
    const wobble = Math.max(...d.map((x) => x.max_gap_h - x.min_gap_h)) / 2;
    expect(drift).toBeLessThan(8);          // hours, mostly Earth's slowing rotation (Delta T), not the Moon
    expect(drift).toBeLessThan(wobble);     // the Moon's own month-to-month swing is bigger
  });
  it('serves the drift data', async () => {
    const r = await handle(new Request('https://x/v1/drift?from=1990&to=2010'));
    const j = await r.json() as { lunations: { k: number; gap_h: number }[]; centuries: { mean_gap_h: number }[]; grid_anchor: string };
    expect(r.status).toBe(200);
    expect(j.lunations.length).toBeGreaterThan(240);
    expect(j.centuries.length).toBe(50);
    expect(j.grid_anchor).toMatch(/^2000-01-06T18:14/);
  });
});

describe('event share cards', () => {
  it('puts the event name on the card', async () => {
    const a = await handle(new Request('https://x/v1/card.png?moonmark=1928.05.07-12.00.00.000000000'));
    const b = await handle(new Request('https://x/v1/card.png?moonmark=1928.05.07-12.00.00.000000000&event=' + encodeURIComponent("Launch party & awards!")));
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(Buffer.from(await a.arrayBuffer()).equals(Buffer.from(await b.arrayBuffer()))).toBe(false);
  });
});
