import { describe, it, expect } from 'vitest';
import { handle } from '../src/index.js';
const get = (u: string) => handle(new Request('http://x' + u), {} as never);

describe('your moon', () => {
  it('describes the moon on a date, at local time', async () => {
    const j = await (await get('/v1/night?d=1969-07-20&t=2017&z=%2B0000')).json() as Record<string, unknown>;
    expect(j.utc).toBe('1969-07-20T20:17:00.000Z');
    expect(j.phase).toBe('Waxing crescent');
    expect(Number(j.illumination)).toBeGreaterThan(0.3);
    expect(Number(j.illumination)).toBeLessThan(0.36);
    expect(j.returns).toBeGreaterThan(new Date().getUTCFullYear() - 1);
  });
  it('uses local noon when no time is given', async () => {
    const j = await (await get('/v1/night?d=2000-01-01&z=-0500')).json() as { utc: string };
    expect(j.utc).toBe('2000-01-01T17:00:00.000Z');
  });
  it('rejects bad dates and ignores unknown occasions', async () => {
    expect((await get('/v1/night?d=1990-02-30')).status).toBe(400);
    expect((await get('/v1/night?d=0999-01-01')).status).toBe(400);
    const j = await (await get('/v1/night?d=1990-06-14&for=%3Cb%3E')).json() as { occasion: string };
    expect(j.occasion).toBe('day');
  });
  it('renders share cards', async () => {
    const r = await get('/v1/night.png?d=1990-06-14&for=born&fmt=story');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
  });
  it('names the place only when it is a city from Moon\'s list', async () => {
    const a = await (await get('/v1/night?d=1990-06-14&in=denver-colorado-us')).json() as { place: string | null };
    expect(a.place).toBe('DENVER, COLORADO');
    const b = await (await get('/v1/night?d=1990-06-14&in=%3Cb%3Ehello')).json() as { place: string | null };
    expect(b.place).toBe(null);
    expect((await get('/v1/night.png?d=1990-06-14&in=london-westminster-gb')).status).toBe(200);
  });
});
