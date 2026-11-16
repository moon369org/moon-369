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

describe('event links', () => {
  it('makes an event link from a local time', async () => {
    const r = await handle(new Request('https://x/v1/event?name=' + encodeURIComponent('Moon launch party') + '&utc=2026-12-04T19:00:00-07:00'));
    const j = await r.json() as Record<string, string | number>;
    expect(r.status).toBe(200);
    expect(j.utc).toBe('2026-12-05T02:00:00.000000000Z');
    expect(String(j.event_url)).toMatch(/^https:\/\/moon369\.org\/m\/\d+\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}\.\d{9}\?e=Moon\+launch\+party$/);
    expect(String(j.google_calendar_url)).toContain('dates=20261205T020000Z/20261205T030000Z');
    expect(String(j.embed)).toContain('data-moon-countdown=');
  });
  it('serves a calendar file', async () => {
    const r = await handle(new Request('https://x/v1/event.ics?name=Launch%2C+v2&utc=2026-12-05T02:00:00Z&minutes=90'));
    const t = await r.text();
    expect(r.headers.get('content-type')).toContain('text/calendar');
    expect(t).toContain('DTSTART:20261205T020000Z'); expect(t).toContain('DURATION:PT90M'); expect(t).toContain('SUMMARY:Launch\\, v2');
  });
  it('round-trips through the event link Moonmark', async () => {
    const a = await (await handle(new Request('https://x/v1/event?name=X+Y&utc=2026-12-05T02:00:00Z'))).json() as { event_url: string };
    const path = new URL(a.event_url).pathname.split('/m/')[1];
    const b = await (await handle(new Request('https://x/v1/m/' + path + '?event=X+Y'))).json() as { utc: string; event: { utc: string } };
    expect(b.event.utc.startsWith('2026-12-05T02:00:00')).toBe(true);
  });
  it('asks for a name and a time', async () => {
    expect((await handle(new Request('https://x/v1/event?utc=2026-12-05T02:00:00Z'))).status).toBe(400);
    expect((await handle(new Request('https://x/v1/event?name=X'))).status).toBe(400);
  });
  it('is a tool for AI assistants', async () => {
    const r = await handle(new Request('https://x/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'make_event_link', arguments: { name: 'Demo day', utc: '2026-12-05T02:00:00Z' } } }) }));
    const j = await r.json() as { result: { structuredContent: { event_url: string } } };
    expect(j.result.structuredContent.event_url).toContain('?e=Demo+day');
  });
});
