import { describe, it, expect } from 'vitest';
import { handle } from '../src/index';
import { phasePath } from '../src/card';

const get = (p: string, init?: RequestInit) => handle(new Request('https://api.moon369.org' + p, init), {});

describe('/v1/card.svg', () => {
  it('returns the live card as SVG with a short cache', async () => {
    const r = await get('/v1/card.svg');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('image/svg+xml');
    expect(r.headers.get('cache-control')).toBe('public, max-age=60');
    const s = await r.text();
    expect(s.startsWith('<svg')).toBe(true);
    expect(s).toContain('TODAY ON MOON');
    expect(s).toContain('font/woff2;base64,');
    expect(s).not.toMatch(/<script|https?:\/\/(?!www\.w3\.org)/);
  });

  it('draws any moment from a moonmark, cached forever', async () => {
    const r = await get('/v1/card.svg?moonmark=1928.05.05-00.40.56.209029029&size=300');
    expect(r.headers.get('cache-control')).toContain('immutable');
    const s = await r.text();
    expect(s).toContain('width="300"');
    expect(s).toContain('MOONMARK');
    expect(s).toContain('>1928<');
    expect(s).toContain('>05<');
    expect(s).toMatch(/LUNE 5 OF 2[89]/);
    expect(s).toContain('aria-label="Year 1928, Moon 05, Lune 05.');
  });

  it('matches /v1/convert for the same instant', async () => {
    const ns = '1794665070306000000';
    const c = await (await get('/v1/convert?unix_ns=' + ns)).json() as any;
    const s = await (await get('/v1/card.svg?unix_ns=' + ns)).text();
    expect(s).toContain(`>${String(c.day).padStart(2, '0')}<`);
    expect(s).toContain(`${Math.round(c.phase.illumination * 100)}% LIT`);
  });

  it('validates size', async () => {
    expect((await get('/v1/card.svg?size=50')).status).toBe(400);
    expect((await get('/v1/card.svg?size=abc')).status).toBe(400);
  });

  it('draws new, half and full moons', () => {
    expect(phasePath(0.5, 10)).toBe('M0,-10 A10,10 0 0 0 0,10 A10.000,10 0 0 0 0,-10Z');
    expect(phasePath(0.25, 10)).toContain('A0.000,10');
  });
});
