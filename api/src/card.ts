// The "Today on Moon" card as a standalone SVG. Fonts are embedded so it renders
// the same inside an <img>, where external fonts and scripts never load.
import { SYNCOPATE_700_WOFF2, JETBRAINS_MONO_400_WOFF2 } from './card-fonts.js';
import type { skyAt } from './moon.js';
import { deflateSync, inflateSync } from 'node:zlib';
import { MOON_MAP_SIZE, MOON_MAP_ZLIB } from './moon-map.js';
import qrcode from 'qrcode-generator';

export interface CardData {
  year: number; moon: number; lune: number; lunesInMoon: number;
  fraction: number;      // real moon phase: 0 new, 0.5 full
  tilt?: number;         // degrees to turn the moon so its lit side points the real way (moonTilt)
  illumination: number;  // 0..1
  name: string;          // e.g. "Waxing crescent"
  title?: string;        // top label, default "TODAY ON MOON"
}

const INK = '#0B0B0D', PAPER = '#E9E4D8', ASH = '#8A8B8F', LINE = '#24262A', SHADOW = '#26272B';
const pad2 = (n: number) => String(n).padStart(2, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The lit part of the moon as a path, centered on 0,0 with radius r. Same math as the site. */
export function phasePath(f: number, r: number, kOverride?: number): string {
  const k = kOverride ?? Math.cos(2 * Math.PI * f), waxing = f < 0.5;
  const outer = waxing ? 1 : 0, inner = (waxing === (k > 0)) ? 0 : 1, rx = Math.abs(k) * r;
  return `M0,-${r} A${r},${r} 0 0 ${outer} 0,${r} A${rx.toFixed(3)},${r} 0 0 ${inner} 0,-${r}Z`;
}

// A tiny PNG encoder (RGBA, no filtering) so the lit face can be shaded per pixel like the site's.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngRGBA(w: number, h: number, px: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, px.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * The lit face, shaded per pixel exactly as the site's living moon (site/js/moonglow.js shade):
 * brightness is a smoothstep of the Sun's angle on a sphere, widest across the face and tight at
 * the rim, so the terminator is a soft gradient that meets the edge cleanly. Returns a data URI.
 */
function litFace(f: number, size: number): string {
  const px = new Uint8Array(size * size * 4), R = size / 2, e = 2 * Math.PI * f, sx = Math.sin(e), sz = -Math.cos(e);
  const ink = [0xE9, 0xE4, 0xD8];
  for (let y = 0; y < size; y++) {
    const ny = (y + 0.5 - R) / R;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - R) / R, rr = nx * nx + ny * ny;
      const edge = Math.min(1, Math.max(0, (1 - Math.sqrt(rr)) * R + 0.5));
      if (edge <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - rr)), dot = nx * sx + nz * sz;
      const A = -0.03 - 0.22 * nz, B = 0.03 + 0.42 * nz;
      const t = Math.min(1, Math.max(0, (dot - A) / (B - A))), a = t * t * (3 - 2 * t) * edge;
      if (a <= 0) continue;
      const o = (y * size + x) * 4;
      px[o] = ink[0]; px[o + 1] = ink[1]; px[o + 2] = ink[2]; px[o + 3] = Math.round(a * 255);
    }
  }
  return 'data:image/png;base64,' + pngRGBA(size, size, px).toString('base64');
}

// The real surface (site/js/moonglow.js does the same): the map's brightness under the sunlight, a faint
// earthshine on the dark side, and over the outer 30% the map fades out and the face brightens toward
// near white, so it runs smoothly into the glow. `turn` turns the map back by the moon's tilt.
let MAP: Uint8Array | undefined;
function albedo(nx: number, ny: number, nz: number): number {
  const m = MAP ?? (MAP = new Uint8Array(inflateSync(Buffer.from(MOON_MAP_ZLIB, 'base64')))), w = MOON_MAP_SIZE;
  const lon = Math.atan2(nx, nz), lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
  const u = (lon / Math.PI + 0.5) * (w - 1), v = (0.5 - lat / Math.PI) * (w - 1);
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(w - 1, y0 + 1);
  const k = ((m[y0 * w + x0] * (1 - fx) + m[y0 * w + x1] * fx) * (1 - fy) + (m[y1 * w + x0] * (1 - fx) + m[y1 * w + x1] * fx) * fy) / 255;
  return Math.min(1, Math.max(0, (k - 0.22) / 0.58));
}
function realFace(f: number, size: number, turn: number): string {
  const px = new Uint8Array(size * size * 4), R = size / 2, e = 2 * Math.PI * f, sx = Math.sin(e), sz = -Math.cos(e);
  const tc = Math.cos(turn * Math.PI / 180), ts = Math.sin(turn * Math.PI / 180), ink = [0xE9, 0xE4, 0xD8];
  for (let y = 0; y < size; y++) {
    const ny = (y + 0.5 - R) / R;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - R) / R, rr = nx * nx + ny * ny;
      const edge = Math.min(1, Math.max(0, (1 - Math.sqrt(rr)) * R + 0.5));
      if (edge <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - rr)), dot = nx * sx + nz * sz;
      const A = -0.07, B = 0.16;   // one even softness, so the lit side curves all the way round the limb to its horns
      const t = Math.min(1, Math.max(0, (dot - A) / (B - A))), sun = t * t * (3 - 2 * t);
      const rim = Math.sqrt(rr); let keep = rim < 0.7 ? 1 : Math.max(0, 1 - (rim - 0.7) / 0.3); keep = keep * keep * (3 - 2 * keep);
      keep = 1 - (1 - keep) * sun;   // the fade and the brightening belong to the lit side only
      const k = 1 - keep * (1 - albedo(nx * tc - ny * ts, nx * ts + ny * tc, nz));
      const lum = sun * (0.71 + 0.29 * k) + (1 - sun) * (0.015 + 0.03 * k), hot = (1 - keep) * 0.75 * sun;
      const o = (y * size + x) * 4;
      let r0 = ink[0] * lum + 24 * (1 - lum), g0 = ink[1] * lum + 25 * (1 - lum), b0 = ink[2] * lum + 28 * (1 - lum);
      r0 += (255 - r0) * hot; g0 += (253 - g0) * hot; b0 += (246 - b0) * hot;
      px[o] = Math.round(r0); px[o + 1] = Math.round(g0); px[o + 2] = Math.round(b0); px[o + 3] = Math.round(edge * 255);
    }
  }
  return 'data:image/png;base64,' + pngRGBA(size, size, px).toString('base64');
}

/**
 * The halo past the lit edge: white light that fades out to 1.6 moon radii, in each direction as
 * bright as the face is lit just inside the rim there. Drawn at half resolution; it is blurred.
 */
function halo(f: number, r: number): string {
  const size = Math.max(8, Math.round(r * 1.6)), c = size / 2, R = c / 1.6;   // 1.6 radii each way
  const e = 2 * Math.PI * f, sx = Math.sin(e), sz = -Math.cos(e), px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy) / R;
    if (d < 0.97 || d > 1.6) continue;
    const cos = dx / (d * R), dot = 0.97 * cos * sx + 0.243 * sz;               // a point just inside the rim
    const t = Math.min(1, Math.max(0, (dot + 0.02) / 0.3)), lit = t * t * (3 - 2 * t);
    const q = Math.max(0, (d - 1) / 0.6), fall = d < 1 ? 1 : Math.pow(1 - q, 2.6);   // eased out to nothing
    const a = lit * fall * 0.25;
    if (a <= 0.002) continue;
    const o = (y * size + x) * 4; px[o] = px[o + 1] = px[o + 2] = 255; px[o + 3] = Math.round(a * 255);
  }
  return 'data:image/png;base64,' + pngRGBA(size, size, px).toString('base64');
}

/**
 * The moon as the site's living moon draws it, frozen at one frame: the lit face shaded like a
 * sphere, a glow made from that same face blurred at three radii, and the Edge Corona (thin rays
 * off the lit limb that fade to nothing along their length and are zero at the poles). Same
 * proportions as site/js/moonglow.js. Centered on 0,0, radius r. `id` keeps defs unique.
 */
export function moonSvg(f: number, r: number, id: string, tilt = 0): string {
  const wax = f < 0.5, lit = (1 - Math.cos(2 * Math.PI * f)) / 2;
  const strength = Math.min(1, 0.6 + lit * 1.2);
  const W = r * 3.8, u = W / 404;          // the site's canvas is 1.9 moon diameters wide
  const size = Math.min(1200, Math.ceil(r * 4));   // the face at 2x for a crisp edge
  const face = `<image href="${litFace(f, size)}" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}"/>`;   // the sunlit shape: glow and rim
  const surface = r >= 10 ? `<image href="${realFace(f, Math.min(800, size), tilt)}" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}"/>` : face;   // what you see
  // Glow: the site blurs the lit face at W/160, W/70 and W/34.
  const glow = [[160, 0.4], [70, 0.2], [34, 0.12]].map(([d, o], i) =>
    `<filter id="${id}g${i}" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${(W / d).toFixed(2)}"/></filter>`);
  const glowUse = [0, 1, 2].map((i) => `<g filter="url(#${id}g${i})" opacity="${([0.4, 0.2, 0.12][i] * strength).toFixed(3)}">${face}</g>`).join('');
  // Rays like the site's, at the iPhone's gentler strength.
  const t = 40, n = 150, R = r;
  const sides = Math.abs(f - 0.5) < 0.02 ? [1, -1] : [wax ? 1 : -1];
  let rays = '', grads = '', g = 0;
  for (const side of sides) {
    for (let j = 0; j < n; j++) {
      const v = j / (n - 1), ang = -Math.PI / 2 + v * Math.PI;
      const env = Math.pow(Math.max(0, Math.cos(ang)), 1.6);
      if (env < 0.02) continue;
      // A still frame: the site's ray shape, with lengths and brightness scattered evenly (seeded,
      // so a card never changes) instead of one moment of its rolling light.
      const h1 = Math.abs(Math.sin(j * 12.9898 + (side > 0 ? 0 : 7)) * 43758.5453) % 1;
      const h2 = Math.abs(Math.sin(j * 78.233 + (side > 0 ? 0 : 3)) * 12543.31) % 1;
      const lift = 0, sway = Math.sin(t * 0.21 + v * 11) * R * 0.012;
      const len = R * (0.24 + 0.3 * h1) * env;
      const a = Math.min(1, (0.45 + 0.55 * h2) * env * strength * 1.2) * 0.45;
      if (a < 0.01) continue;
      const dx = Math.cos(ang) * side, dy = Math.sin(ang);
      const x0 = dx * R * 0.96 + sway * side, y0 = dy * R * 0.96 + lift, x1 = dx * (R + len) + sway * side, y1 = dy * (R + len) + lift;
      const gid = `${id}y${g++}`;
      grads += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}">` +
        `<stop offset="0" stop-color="${PAPER}" stop-opacity="${(a * 0.3).toFixed(3)}"/><stop offset="0.12" stop-color="${PAPER}" stop-opacity="${a.toFixed(3)}"/>` +
        `<stop offset="0.35" stop-color="${PAPER}" stop-opacity="${(a * 0.55).toFixed(3)}"/><stop offset="0.7" stop-color="${PAPER}" stop-opacity="${(a * 0.15).toFixed(3)}"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></linearGradient>`;
      rays += `<path d="M${x0.toFixed(1)},${y0.toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}" stroke="url(#${gid})" stroke-width="${(2.2 * u).toFixed(2)}" stroke-linecap="round"/>`;
    }
  }
  // A bright white edge on the lit limb: a thin white ring, kept only where the face is lit (the
  // face itself is the mask, so it fades with the terminator), then blurred so it blooms out.
  const rim = (w: number, blur: number, op: number, k: string) =>
    `<g filter="url(#${id}${k})" opacity="${op}"><circle r="${(r - w / 2).toFixed(2)}" fill="none" stroke="#FFFFFF" stroke-width="${w.toFixed(2)}" mask="url(#${id}m)"/></g>`;
  const art = `<defs>${glow.join('')}<filter id="${id}r" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.max(0.5, W / 340).toFixed(2)}"/></filter>${grads}` +
    `<mask id="${id}m" maskUnits="userSpaceOnUse" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}">${face}</mask>` +
    `<filter id="${id}e1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(r * 0.008).toFixed(2)}"/></filter>` +
    `<filter id="${id}e2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(r * 0.035).toFixed(2)}"/></filter>` +
    // Halo: a gradient of light running out past the lit edge, as bright as the rim is lit in each
    // direction, so it follows the lit side and thins away toward the shadow.
    `<filter id="${id}hb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(r * 0.04).toFixed(2)}"/></filter></defs>` +
    glowUse +
    `<g filter="url(#${id}hb)"><image href="${halo(f, r)}" x="${(-r * 1.6).toFixed(1)}" y="${(-r * 1.6).toFixed(1)}" width="${(r * 3.2).toFixed(1)}" height="${(r * 3.2).toFixed(1)}"/></g>` +
    `<circle r="${r}" fill="#24262A"/>` + surface +
    rim(r * 0.09, r * 0.035, 0.55, 'e2') + rim(r * 0.025, r * 0.008, 0.95, 'e1') +
    `<g filter="url(#${id}r)">${rays}</g>`;
  return tilt ? `<g transform="rotate(${tilt})">${art}</g>` : art;
}

/** Moon's moon on its own, as on the site: the lit face, glow, rim, halo and rays, turned to the real tilt. Square. */
export function moonOnlySvg(f: number, tilt: number, size: number, bg: 'none' | 'dark' = 'none', label = 'The Moon'): string {
  const r = size / 3.8;   // the site's canvas is 1.9 moon diameters wide, so the glow has room to fade
  const h = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-h} ${-h} ${size} ${size}" role="img" aria-label="${label.replace(/[<&"]/g, '')}">` +
    (bg === 'dark' ? `<rect x="${-h}" y="${-h}" width="${size}" height="${size}" fill="${INK}"/>` : '') + moonSvg(f, r, 'mo', tilt) + '</svg>';
}

/** Options for the Today on Moon card: light or dark, the Moonmark line, and a local-time line for one time zone. */
export interface CardOpts { theme?: 'dark' | 'light'; mark?: string; local?: string }

export function cardSvg(d: CardData, size = 600, o: CardOpts = {}): string {
  const light = o.theme === 'light';
  const BG = light ? '#F4F1EA' : INK, FG = light ? INK : PAPER, DIM = light ? '#5E6064' : ASH, RULE = light ? '#D9D4C7' : LINE, SOFTC = light ? '#3A3B3F' : '#B9B6AE';
  const extra = (o.mark ? `<text x="300" y="${o.local ? 338 : 350}" class="m">${esc(o.mark)}</text>` : '') + (o.local ? `<text x="300" y="${o.mark ? 362 : 350}" class="l">${esc(o.local)}</text>` : '');
  const title = esc((d.title ?? 'TODAY ON MOON').toUpperCase());
  const foot = esc(`${d.name.toUpperCase()} · ${(d.illumination * 100).toFixed(1)}% LIT · LUNE ${d.lune} OF ${d.lunesInMoon}`);
  const label = esc(`Year ${d.year}, Moon ${pad2(d.moon)}, Lune ${pad2(d.lune)}. ${d.name}, ${(d.illumination * 100).toFixed(1)}% lit.`);
  const cols = [['CYCLE', String(d.year)], ['MOON', pad2(d.moon)], ['LUNE', pad2(d.lune)]];
  const colW = 504 / 3;
  const cells = cols.map(([k, v], i) => {
    const cx = 48 + colW * i + colW / 2;
    const fs = v.length > 5 ? Math.max(22, 40 - (v.length - 5) * 4) : 40;
    return `<text x="${cx}" y="430" class="k">${k}</text><text x="${cx}" y="482" class="v" font-size="${fs}">${esc(v)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 600 600" role="img" aria-label="${label}">` +
    `<title>${label}</title>` +
    `<defs><style>` +
    `@font-face{font-family:MoonSync;src:url(data:font/woff2;base64,${SYNCOPATE_700_WOFF2}) format('woff2');font-weight:700}` +
    `@font-face{font-family:MoonMono;src:url(data:font/woff2;base64,${JETBRAINS_MONO_400_WOFF2}) format('woff2')}` +
    `.t{font-family:MoonMono,ui-monospace,monospace;font-size:17px;letter-spacing:6px;fill:${DIM};text-anchor:middle}` +
    `.k{font-family:MoonMono,ui-monospace,monospace;font-size:13px;letter-spacing:4px;fill:${DIM};text-anchor:middle}` +
    `.v{font-family:MoonSync,'Arial Black',sans-serif;font-weight:700;letter-spacing:2px;fill:${FG};text-anchor:middle}` +
    `.f{font-family:MoonMono,ui-monospace,monospace;font-size:13px;letter-spacing:2.6px;fill:${SOFTC};text-anchor:middle}` +
    `.m{font-family:MoonMono,ui-monospace,monospace;font-size:19px;letter-spacing:1px;fill:${FG};text-anchor:middle}` +
    `.l{font-family:MoonMono,ui-monospace,monospace;font-size:13px;letter-spacing:1.5px;fill:${DIM};text-anchor:middle}` +
    `</style>` +
    `<radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PAPER}" stop-opacity="${light ? 0 : 0.07}"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect width="600" height="600" rx="24" fill="${BG}"/>` +
    `<rect x="0.5" y="0.5" width="599" height="599" rx="23.5" fill="none" stroke="${RULE}"/>` +
    `<text x="300" y="84" class="t">${title}</text>` +
    `<circle cx="300" cy="226" r="118" fill="url(#g)"/>` +
    `<g transform="translate(300,226)">${moonSvg(d.fraction, 56, 'mc', d.tilt)}</g>` +
    `<path d="M48 380H552M48 512H552M${48 + colW} 380V512M${48 + 2 * colW} 380V512" stroke="${RULE}" stroke-width="1.5" fill="none"/>` +
    cells + extra +
    `<text x="300" y="560" class="f">${foot}</text>` +
    `</svg>`;
}

export interface ShareData extends CardData { time: string; ns: string; event?: string; sky?: ReturnType<typeof skyAt>; qr?: string }

/** A QR code as SVG: paper squares with ink modules, sized to `size` at (x, y). Level M, with a quiet zone. */
export function qrSvg(url: string, x: number, y: number, size: number): string {
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(), quiet = 2, u = size / (n + quiet * 2);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${((c + quiet) * u).toFixed(2)} ${((r + quiet) * u).toFixed(2)}h${u.toFixed(2)}v${u.toFixed(2)}h-${u.toFixed(2)}z`;
  return `<g transform="translate(${x},${y})"><rect width="${size}" height="${size}" rx="6" fill="${PAPER}"/><path d="${d}" fill="${INK}"/></g>`;
}

/** An event name over the Moonmark: up to two lines that fit the 528 px column, shrinking for long names. */
function eventTitle(name: string): string {
  const words = name.trim().split(/\s+/), W = 528;
  for (const fs of [40, 34, 28, 24, 20]) {
    const per = Math.floor(W / (fs * 0.6)), lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (next.length <= per) cur = next; else { if (cur) lines.push(cur); cur = w.length > per ? w.slice(0, per - 1) + '…' : w; }
    }
    if (cur) lines.push(cur);
    if (lines.length <= 2) {
      const top = lines.length === 2 ? 150 - fs * 1.15 : 150;
      return lines.map((l, i) => `<text x="558" y="${(top + i * fs * 1.15).toFixed(0)}" font-family="JetBrains Mono" font-size="${fs}" fill="${PAPER}">${esc(l)}</text>`).join('');
    }
  }
  return `<text x="558" y="150" font-family="JetBrains Mono" font-size="20" fill="${PAPER}">${esc(name.slice(0, 44))}…</text>`;
}

/** A 1200x630 share image for one Moonmark (X, iMessage, Slack and other link previews). */
export function shareSvg(d: ShareData): string {
  const pct = (d.illumination * 100).toFixed(1);
  const nsG = '.' + d.ns.slice(0, 3) + ' ' + d.ns.slice(3, 6) + ' ' + d.ns.slice(6, 9);
  // With the sky: phase, tilt, distance and tides, in four cells. Without it: cycle, moon, lune.
  const sk = d.sky;
  const cells: [string, string, boolean?][] = sk
    ? [['PHASE', `${pct}%`], ['TILT', sk.tilt.fully_lit ? 'FULL' : String(Math.round(sk.tilt.limb_angle_deg)), !sk.tilt.fully_lit],
       ['KM AWAY', sk.distance.km.toLocaleString('en-US')], ['TIDES', sk.tide.strength.toUpperCase()]]
    : [['CYCLE', String(d.year)], ['MOON', pad2(d.moon)], ['LUNE', pad2(d.lune)]];
  const cw = 528 / cells.length;
  const grid = cells.map(([k, v, deg], i) => {
    const x = 560 + cw * i;
    if (sk) {
      // Values in mono (0.6 em a character) so they fit; the degree sign is drawn, the fonts carry no glyph for it.
      const fs = 24, w = v.length * fs * 0.6;
      return `<text x="${x + 18}" y="452" font-family="JetBrains Mono" font-size="14" letter-spacing="4" fill="${ASH}">${k}</text>` +
        `<text x="${x + 18}" y="497" font-family="JetBrains Mono" font-size="${fs}" fill="${PAPER}">${esc(v)}</text>` +
        (deg ? `<circle cx="${(x + 18 + w + 6).toFixed(1)}" cy="480" r="3.2" fill="none" stroke="${PAPER}" stroke-width="2"/>` : '');
    }
    const fs = v.length > 5 ? Math.max(22, 34 - (v.length - 5) * 4) : 34;
    return `<text x="${x + 22}" y="452" font-family="JetBrains Mono" font-size="15" letter-spacing="4" fill="${ASH}">${k}</text>` +
      `<text x="${x + 22}" y="500" font-family="Syncopate" font-weight="700" font-size="${fs}" letter-spacing="1.5" fill="${PAPER}">${esc(v)}</text>`;
  }).join('');
  const lines = cells.slice(1).map((_, i) => `M${(560 + cw * (i + 1)).toFixed(1)} 412V528`).join('');
  const foot = sk ? `${d.name.toUpperCase()} · LUNE ${d.lune}` : `${d.name.toUpperCase()} · ${pct}% LIT`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PAPER}" stop-opacity="0.09"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="1200" height="630" fill="${INK}"/>` +
    `<svg x="66" y="62" width="148" height="42" viewBox="-10 -10 424 120"><path d="M4,100 V4 L48,64 L92,4 V100" fill="none" stroke="#E9E4D8" stroke-width="8" stroke-linejoin="bevel"/><path d="M312,100 V4 L400,96 V0" fill="none" stroke="#E9E4D8" stroke-width="8" stroke-linejoin="bevel"/><defs><mask id="mwA" maskUnits="userSpaceOnUse" x="-10" y="-10" width="424" height="120"><rect x="-10" y="-10" width="424" height="120" fill="#fff"/><circle cx="232.0" cy="50" r="46" fill="none" stroke="#000" stroke-width="18"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#fff" stroke-width="18"/></mask><mask id="mwB" maskUnits="userSpaceOnUse" x="-10" y="-10" width="424" height="120"><rect x="-10" y="-10" width="424" height="120" fill="#fff"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#000" stroke-width="18"/></mask></defs><circle cx="172.0" cy="50" r="46" fill="none" stroke="#E9E4D8" stroke-width="8" mask="url(#mwA)"/><circle cx="232.0" cy="50" r="46" fill="none" stroke="#E9E4D8" stroke-width="8" mask="url(#mwB)"/></svg>` +
    `<circle cx="290" cy="345" r="250" fill="url(#g)"/>` +
    `<g transform="translate(290,345)">${moonSvg(d.fraction, 150, 'ms', d.tilt)}</g>` +
    (d.event ? eventTitle(d.event) : `<text x="560" y="150" font-family="JetBrains Mono" font-size="18" letter-spacing="7" fill="${ASH}">${esc((d.title ?? 'MOONMARK').toUpperCase())}</text>`) +
    `<text x="556" y="232" font-family="JetBrains Mono" font-size="64" fill="${PAPER}">${d.year}.${pad2(d.moon)}.${pad2(d.lune)}</text>` +
    `<text x="556" y="310" font-family="JetBrains Mono" font-size="64" fill="${PAPER}">${esc(d.time)}</text>` +
    `<text x="560" y="362" font-family="JetBrains Mono" font-size="34" fill="${ASH}">${nsG}</text>` +
    `<path d="M560 412H1088M560 528H1088${lines}" stroke="${LINE}" stroke-width="2" fill="none"/>` +
    grid +
    (d.qr ? qrSvg(d.qr, 66, 474, 124) + `<text x="204" y="590" font-family="JetBrains Mono" font-size="13" letter-spacing="3" fill="${ASH}">SCAN · YOUR TIME</text>` : '') +
    `<text x="560" y="584" font-family="JetBrains Mono" font-size="17" letter-spacing="3" fill="#B9B6AE">${esc(foot)}</text>` +
    `<text x="1088" y="584" font-family="JetBrains Mono" font-size="17" letter-spacing="3" fill="${ASH}" text-anchor="end">MOON369.ORG</text>` +
    `</svg>`;
}
