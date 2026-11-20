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
    expect(s).toMatch(/\d+\.\d% LIT/);
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

describe('/v1/card.png', () => {
  it('renders a 1200x630 PNG share image for a Moonmark', async () => {
    const r = await get('/v1/card.png?moonmark=1928.05.05-04.04.24.251136779');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('cache-control')).toContain('immutable');
    const b = new Uint8Array(await r.arrayBuffer());
    expect([...b.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    const view = new DataView(b.buffer);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
  });
});

import { moonOnlySvg } from '../src/card';
import { handle as handleMoon } from '../src/index';
describe('the moon on its own', () => {
  it('draws the site moon, square, transparent by default', () => {
    const s = moonOnlySvg(0.25, 17, 400);
    expect(s).toMatch(/^<svg[^>]*width="400" height="400"/);
    expect(s).toContain('rotate(17)');
    expect(s).not.toContain('<rect');
    expect(moonOnlySvg(0.25, 0, 400, 'dark')).toContain('<rect');
  });
  it('serves /v1/moon.svg and /v1/moon.png', async () => {
    const r = await handleMoon(new Request('https://x/v1/moon.svg?utc=2026-11-16T12:00:00Z&size=256'));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(await r.text()).toContain('First quarter');
    const p = await handleMoon(new Request('https://x/v1/moon.png?size=128&bg=dark&tilt=off'));
    expect(p.headers.get('Content-Type')).toBe('image/png');
    expect((await handleMoon(new Request('https://x/v1/moon.svg?size=5'))).status).toBe(400);
  });
});

describe('card options and moment QR', () => {
  it('draws card.svg light, with the Moonmark and local time', async () => {
    const r = await handleMoon(new Request('https://x/v1/card.svg?moonmark=1928.05.12-15.00.00.0&theme=light&mark=on&tz=America/Denver'));
    const s = await r.text();
    expect(r.status).toBe(200);
    expect(s).toContain('#F4F1EA');
    expect(s).toContain('1928.05.12 15:00:00');
    expect(s).toMatch(/M[SD]T/);
    expect((await handleMoon(new Request('https://x/v1/card.svg?tz=Not/AZone'))).status).toBe(400);
    expect((await handleMoon(new Request('https://x/v1/card.svg?theme=pink'))).status).toBe(400);
  });
  it('puts a QR on event cards only', async () => {
    const { shareSvg } = await import('../src/card');
    const base = { year: 1928, moon: 5, lune: 12, lunesInMoon: 28, fraction: 0.4, tilt: 0, illumination: 0.9, name: 'Waxing gibbous', time: '15:00:00', ns: '000000000' };
    expect(shareSvg({ ...base, event: 'Launch', qr: 'https://moon369.org/m/1928.05.12-15.00.00?e=Launch' })).toContain('SCAN · YOUR TIME');
    expect(shareSvg(base)).not.toContain('SCAN · YOUR TIME');   // the full label: the moon's embedded image data can hold any four letters
  });
});
