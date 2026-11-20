// Eclipse icons, one per type, in Moon's colours. A still frame of the living eclipses on the site
// (site/js/eclipseglow.js): the same geometry, glow and rays, so icons, share cards and the
// animation all match. Pure SVG with no fonts, so it works in an <img>, in link previews and in resvg.
//   total    a black disc inside a corona of tapered, irregular rays and long streamers, with the diamond ring's bead
//   annular  a ring of fire with a soft glow, no rays
//   hybrid   the ring thins to nothing on one side, where the corona takes over
//   partial  the sun with a bite out of it; light only from the uncovered edge
import type { EclipseType } from './eclipses.js';
import { albedo, pngRGBA } from './card.js';

const INK = '#0B0B0D', LIGHT = '233,228,216', SUN = '#F4EFE3';
const wave = (t: number, s: number) => Math.sin(t * 0.31 + s) * 0.55 + Math.sin(t * 0.173 + s * 2.1) * 0.3 + Math.sin(t * 0.071 + s * 3.7) * 0.15;
const f2 = (n: number) => n.toFixed(2);

function geo(type: EclipseType) {
  const R = 26;
  if (type === 'annular') return { R, mx: 0, my: 0, mr: R - 3.6 };
  if (type === 'hybrid') return { R, mx: -1.9, my: 0, mr: R - 1.1 };
  if (type === 'partial') return { R, mx: 13, my: -11, mr: R + 0.5 };
  return { R, mx: 0, my: 0, mr: R };
}

// The real faces, as site/js/eclipseglow.js draws them: the sun brighter in the middle, dimmer and warmer
// toward its edge with fine still granulation; the moon the real near side, barely there in earthshine.
function hash(i: number, j: number) { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y); let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return (hash(i, j) * (1 - fx) + hash(i + 1, j) * fx) * (1 - fy) + (hash(i, j + 1) * (1 - fx) + hash(i + 1, j + 1) * fx) * fy;
}
function sunPx(nx: number, ny: number, hot = false): [number, number, number] {
  const mu = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), m1 = 1 - mu, I = 1 - 0.38 * m1 - 0.2 * m1 * m1;
  const gran = (vnoise(nx * 7 + 9, ny * 7 + 9) - 0.5) * 0.6 + (vnoise(nx * 16 + 3, ny * 16 + 3) - 0.5) * 0.4;
  if (hot) { const Lh = (0.9 + 0.1 * I) * (1 + gran * 0.04 * mu), wh = Math.pow(m1, 2); return [255 * Lh, (253 - 14 * wh) * Lh, (248 - 40 * wh) * Lh]; }
  const L = (0.7 + 0.3 * I) * (1 + gran * 0.09 * mu), w = Math.pow(m1, 1.2);
  return [(248 * (1 - w) + 228 * w) * L, (244 * (1 - w) + 205 * w) * L, (234 * (1 - w) + 168 * w) * L];
}
function moonPx(nx: number, ny: number): [number, number, number] {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), lum = (0.025 + 0.17 * albedo(nx, ny, nz)) * (0.45 + 0.55 * nz);
  return [11 + 222 * lum, 11 + 217 * lum, 13 + 203 * lum];
}
const FACES = new Map<string, string>();
function face(kind: 'sun' | 'hot' | 'moon', n: number): string {
  const key = kind + n, hit = FACES.get(key); if (hit) return hit;
  const px = new Uint8Array(n * n * 4), R = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const nx = (x + 0.5 - R) / R, ny = (y + 0.5 - R) / R, edge = Math.min(1, Math.max(0, (1 - Math.hypot(nx, ny)) * R + 0.5));
    if (edge <= 0) continue;
    const p = kind === 'moon' ? moonPx(nx, ny) : sunPx(nx, ny, kind === 'hot'), o = (y * n + x) * 4;
    px[o] = Math.round(p[0]); px[o + 1] = Math.round(p[1]); px[o + 2] = Math.round(p[2]); px[o + 3] = Math.round(edge * 255);
  }
  const uri = 'data:image/png;base64,' + pngRGBA(n, n, px).toString('base64');
  FACES.set(key, uri); return uri;
}
const disc = (kind: 'sun' | 'hot' | 'moon', cx: number, cy: number, r: number, size: number) =>
  `<image href="${face(kind, Math.max(16, Math.min(512, Math.round(size * r / 50))))}" x="${f2(cx - r)}" y="${f2(cy - r)}" width="${f2(2 * r)}" height="${f2(2 * r)}"/>`;

// Fixed, irregular layouts, the same seeds as eclipseglow.js, so the icons match the animation.
function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function streamers() {
  const r = rng(11), out: { a: number; len: number; w: number; op: number; bend: number }[] = [], n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k + 0.15 + r() * 0.7) / n * Math.PI * 2;
    out.push({ a, len: 0.5 + r() * 0.32, w: 0.09 + r() * 0.13, op: 0.7 + r() * 0.5, bend: (r() - 0.5) * 0.1 });
  }
  return out;
}
function filaments(n: number) {
  const r = rng(29), out: { a: number; len: number; op: number; w: number; p: number; bend: number; layer: number }[] = [];
  for (let j = 0; j < n; j++) {
    const br = Math.pow(r(), 1.7);
    out.push({ a: r() * Math.PI * 2, len: 0.3 + Math.pow(r(), 1.1) * 0.75, op: 0.07 + br * 0.32, w: 2 + Math.pow(r(), 2) * 8, p: r() * 100, bend: (r() - 0.5) * 0.08, layer: br > 0.55 ? 0 : br > 0.2 ? 1 : 2 });
  }
  return out;
}
const pt = (ang: number, d: number) => `${f2(Math.cos(ang) * d)},${f2(Math.sin(ang) * d)}`;
/** A tapered wedge of light from the limb out to a point, fading as it goes. */
function wedge(id: string, ang: number, half: number, bend: number, R: number, reach: number, a: number, stops: [number, number][], base = 0.97, curve = 0.45, at = 0.4): [string, string] {
  const tip = R + reach, mid = R + reach * at;
  const grad = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" fx="0" fy="0" r="${f2(tip)}">` +
    stops.map(([o, k]) => `<stop offset="${f2(o * (tip - R * base) / tip + R * base / tip)}" stop-color="rgb(${LIGHT})" stop-opacity="${f2(Math.min(1, a) * k)}"/>`).join('') + `</radialGradient>`;
  const d = `M${pt(ang - half, R * base)}Q${pt(ang + bend * 0.5 - half * curve, mid)} ${pt(ang + bend, tip)}Q${pt(ang + bend * 0.5 + half * curve, mid)} ${pt(ang + half, R * base)}Z`;
  return [grad, `<path d="${d}" fill="url(#${id})"/>`];
}

/** The light of one still frame, as in eclipseglow.js. Coordinates on a 100-unit canvas centred on 0,0. */
function light(type: EclipseType, id: string, small: boolean, t = 37): string {
  const g = geo(type), R = g.R;
  if (type === 'total' || type === 'hybrid') {
    const side = (ang: number) => type === 'hybrid' ? Math.max(0, Math.min(1, (0.25 - Math.cos(ang)) / 1.05)) : 1;
    const S = streamers();
    let defs = '', body = '';
    // Long soft streamers.
    let sp = '';
    S.forEach((st, k) => {
      const ang = st.a + 0.06 * wave(t * 0.05, k * 1.7), env = side(ang);
      if (env < 0.03) return;
      const len = Math.min(R * st.len * (1 + 0.08 * wave(t * 0.09, k * 2.3)), 44 - R);
      const a = st.op * env * (0.85 + 0.15 * wave(t * 0.11, k));
      const [gd, path] = wedge(`${id}s${k}`, ang, st.w, st.bend, R, len, a, [[0, 1], [0.3, 0.45], [0.7, 0.1], [1, 0]], 0.98, 0.35, 0.45);
      defs += gd; sp += path;
    });
    defs += `<filter id="${id}fs" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${f2(100 / (small ? 40 : 60))}"/></filter>`;
    body += `<g filter="url(#${id}fs)">${sp}</g>`;
    // Tapered rays in layers from soft to sharp, so neighbours blur into one another.
    const F = filaments(small ? 50 : 220);
    const layers: [number, number, number][] = small ? [[100 / 45, 1.6, 0], [100 / 140, 0.8, 1]] : [[100 / 38, 1.5, 0], [100 / 110, 0.85, 1], [100 / 320, 0.45, 2]];
    layers.forEach(([blur, widen, layer]) => {
      let rp = '';
      F.forEach((f, j) => {
        if (f.layer > layer + 1) return;
        const ang = f.a + 0.012 * wave(t * 0.06, f.p), env = side(ang);
        let near = 0;
        for (const st of S) { const d = Math.atan2(Math.sin(ang - st.a), Math.cos(ang - st.a)); near += st.op * Math.exp(-d * d / 0.08); }
        near = Math.min(1, near);
        const reach = Math.min(R * f.len * (0.6 + 0.6 * near) * (1 + 0.1 * wave(t * 0.08, f.p)), 45 - R);
        const a = f.op * env * (0.45 + 0.7 * near) * (0.85 + 0.15 * wave(t * 0.1, f.p * 1.3)) / (layer === 2 ? 1.4 : 1);
        if (a < 0.01) return;
        const [gd, path] = wedge(`${id}f${layer}_${j}`, ang, f.w * widen / 100, f.bend + 0.01 * wave(t * 0.07, f.p * 0.7), R, reach, a, [[0, 1], [0.2, 0.6], [0.55, 0.22], [0.85, 0.05], [1, 0]]);
        defs += gd; rp += path;
      });
      defs += `<filter id="${id}f${layer}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${f2(blur)}"/></filter>`;
      body += `<g filter="url(#${id}f${layer})">${rp}</g>`;
    });
    return `<defs>${defs}</defs>${body}`;
  }
  // Annular and partial: no spikes, just soft light drifting along the bare edge.
  let defs = '', body = '';
  for (let k = 0; k < 7; k++) {
    const ang = k / 7 * Math.PI * 2 + 0.35 * wave(t * 0.04, k * 2.9), px = Math.cos(ang) * R, py = Math.sin(ang) * R;
    const env = type === 'partial' ? Math.max(0, Math.min(1, (Math.hypot(px - g.mx, py - g.my) - g.mr) / (R * 0.25))) : 1;
    const a = 0.16 * env * (0.6 + 0.4 * (0.5 + 0.5 * wave(t * 0.15, k * 1.3)));
    if (a < 0.01) continue;
    defs += `<radialGradient id="${id}g${k}" gradientUnits="userSpaceOnUse" cx="${f2(px)}" cy="${f2(py)}" r="${f2(R * 0.55)}"><stop offset="0" stop-color="${SUN}" stop-opacity="${f2(a)}"/><stop offset="1" stop-color="${SUN}" stop-opacity="0"/></radialGradient>`;
    body += `<circle cx="${f2(px)}" cy="${f2(py)}" r="${f2(R * 0.55)}" fill="url(#${id}g${k})"/>`;
  }
  defs += `<filter id="${id}fg" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${f2(100 / 22)}"/></filter>`;
  return `<defs>${defs}</defs><g filter="url(#${id}fg)">${body}</g>`;
}

/** An eclipse icon on a 100x100 canvas centred on 0,0. `bg` paints the ink square behind it. */
export function eclipseIcon(type: EclipseType, size = 64, bg = true, id = 'ec'): string {
  const g = geo(type), corona = type === 'total' || type === 'hybrid';
  const small = size <= 128;   // small icons draw fewer rays, so long lists stay light
  const defs =
    `<filter id="${id}b1" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${type === 'total' ? 6 : 5.5}"/></filter>` +
    `<filter id="${id}b2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.9"/></filter>` +
    `<filter id="${id}b0" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>` +
    `<filter id="${id}b4" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${f2(100 / 70)}"/></filter>` +
    `<filter id="${id}b3" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.35"/></filter>` +
    `<radialGradient id="${id}sun" r="0.5"><stop offset="0" stop-color="${SUN}"/><stop offset="0.85" stop-color="rgb(${LIGHT})"/><stop offset="1" stop-color="#D8D1C1"/></radialGradient>` +
    `<radialGradient id="${id}bead" r="0.5"><stop offset="0" stop-color="${SUN}"/><stop offset="0.35" stop-color="${SUN}" stop-opacity="0.8"/><stop offset="1" stop-color="${SUN}" stop-opacity="0"/></radialGradient>`;
  let art: string;
  if (type === 'total') {
    art = `<circle r="${f2(g.R * 1.06)}" fill="rgb(${LIGHT})" opacity="0.45" filter="url(#${id}b1)"/>` +
      `<circle r="${f2(g.R * 1.03)}" fill="none" stroke="rgb(${LIGHT})" stroke-width="${f2(g.R * 0.16)}" opacity="0.4" filter="url(#${id}b2)"/>` +
      light(type, id, small) +
      `<circle r="${f2(g.R * 1.035)}" fill="none" stroke="rgb(${LIGHT})" stroke-width="${f2(g.R * 0.075)}" filter="url(#${id}b3)"/>`;
  } else {
    const glow = type === 'partial' ? 0.3 : 0.42;
    art = `<circle r="${f2(g.R * 1.02)}" fill="rgb(${LIGHT})" opacity="${glow}" filter="url(#${id}b1)"/>` +
      `<circle r="${f2(g.R * 1.01)}" fill="rgb(${LIGHT})" opacity="${f2(glow * 0.8)}" filter="url(#${id}b2)"/>` +
      (type === 'partial' ? '' :   // a bare ring of sun is blinding: a wide bloom and a tight hot halo hug it
        `<circle r="${f2(g.R * 1.04)}" fill="rgb(${LIGHT})" opacity="0.3" filter="url(#${id}b0)"/>` +
        `<circle r="${f2(g.R * 0.985)}" fill="none" stroke="#FFFDF8" stroke-width="${f2(g.R * 0.14)}" opacity="0.9" filter="url(#${id}b4)"/>`) +
      disc(type === 'partial' ? 'sun' : 'hot', 0, 0, g.R, size) +
      light(type, id, small);
  }
  art += `<circle cx="${g.mx}" cy="${g.my}" r="${f2(g.mr * 0.995)}" fill="${INK}"/>` + disc('moon', g.mx, g.my, g.mr, size);
  // The diamond ring's last bead of light: a soft gradient dot, no filter (filters on tiny shapes draw a box in some browsers).
  if (type === 'total') art += `<circle cx="${f2(g.R * 0.72)}" cy="${f2(-g.R * 0.69)}" r="${f2(g.R * 0.085)}" fill="url(#${id}bead)"/>`;
  const label = `${type[0].toUpperCase() + type.slice(1)} solar eclipse`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-50 -50 100 100" role="img" aria-label="${label}">` +
    `<title>${label}</title><defs>${defs}</defs>` +
    (bg ? `<rect x="-50" y="-50" width="100" height="100" rx="22" fill="${INK}"/>` : '') + art + `</svg>`;
}
