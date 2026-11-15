import { describe, it, expect } from 'vitest';
import { handle } from '../src/index.js';
import { allEclipses, ymdOf } from '../src/eclipses.js';
const get = (u: string) => handle(new Request('http://x' + u), {} as never);

describe('solar eclipses', () => {
  it('matches NASA counts for 2001 to 2100 and the five millennia', () => {
    const a = allEclipses();
    expect(a.length).toBeGreaterThan(11880); expect(a.length).toBeLessThan(11910);   // NASA: 11,898
    const c: Record<string, number> = {};
    for (const e of a.filter((e) => e.y >= 2001 && e.y <= 2100)) c[e.type] = (c[e.type] ?? 0) + 1;
    expect(c).toEqual({ total: 68, annular: 72, partial: 77, hybrid: 7 });
    expect(a.filter((e) => e.y >= -1999 && e.y <= -1900).length).toBe(239);
    expect(a.filter((e) => e.y >= 2601 && e.y <= 2700).length).toBe(227);
  });
  it('knows famous eclipses, their saros and type', async () => {
    const e = await (await get('/v1/eclipses/2024-04-08')).json() as { type: string; saros: number; saros_series: { member: number; of: number } };
    expect(e.type).toBe('total'); expect(e.saros).toBe(139);
    expect(e.saros_series.member).toBe(30); expect(e.saros_series.of).toBe(71);
    const thales = await (await get('/v1/eclipses/-0584-05-28')).json() as { type: string; year_label: string; calendar: string };
    expect(thales.type).toBe('total'); expect(thales.year_label).toBe('585 BCE'); expect(thales.calendar).toBe('julian');
    for (const [d, t] of [['2023-04-20', 'hybrid'], ['2023-10-14', 'annular'], ['2026-08-12', 'total'], ['2027-08-02', 'total'], ['1999-08-11', 'total']])
      expect(allEclipses().find((x) => ymdOf(x) === d)?.type).toBe(t);
  });
  it('lists, finds the next one, exports CSV and draws icons', async () => {
    const n = await (await get('/v1/eclipses/next?type=total&after=' + Date.parse('2026-11-15'))).json() as { date: string };
    expect(n.date).toBe('2027-08-02');
    const l = await (await get('/v1/eclipses?from=2026&to=2030&type=total')).json() as { count: number };
    expect(l.count).toBe(4);
    expect((await get('/v1/eclipses/2024-04-09')).status).toBe(404);
    expect((await (await get('/v1/eclipses.csv')).text()).trim().split('\n').length).toBe(allEclipses().length + 1);
    for (const t of ['total', 'annular', 'hybrid', 'partial']) expect((await get('/v1/eclipse.svg?type=' + t)).status).toBe(200);
    expect((await get('/v1/eclipse.svg?type=blood')).status).toBe(400);
    expect((await get('/v1/eclipse.png?date=2024-04-08')).headers.get('content-type')).toBe('image/png');
  });
});
