// Eclipse icons, one per type, in Moon's colours. A still frame of the living eclipses on the site
// (site/js/eclipseglow.js): the same geometry, glow and rays, so icons, share cards and the
// animation all match. Pure SVG with no fonts, so it works in an <img>, in link previews and in resvg.
//   total    a black disc inside a corona of fine rays and long streamers, with the diamond ring's bead
//   annular  a ring of fire with short rays off its outer edge
//   hybrid   the ring thins to nothing on one side, where the corona takes over
//   partial  the sun with a bite out of it; light only from the uncovered edge
import type { EclipseType } from './eclipses.js';

const INK = '#0B0B0D', LIGHT = '233,228,216', SUN = '#F4EFE3';
const wave = (t: number, s: number) => Math.sin(t * 0.31 + s) * 0.55 + Math.sin(t * 0.173 + s * 2.1) * 0.3 + Math.sin(t * 0.071 + s * 3.7) * 0.15;
const f2 = (n: number) => n.toFixed(2);

function geo(type: EclipseType) {
  const R = 26;
  if (type === 'annular') return { R, mx: 0, my: 0, mr: R - 5.5 };
  if (type === 'hybrid') return { R, mx: -1.9, my: 0, mr: R - 1.1 };
  if (type === 'partial') return { R, mx: 13, my: -11, mr: R + 0.5 };
  return { R, mx: 0, my: 0, mr: R };
}

/** The rays of one still frame, as in eclipseglow.js. Coordinates on a 100-unit canvas centred on 0,0. */
function rays(type: EclipseType, id: string, n: number, t = 37): string {
  const g = geo(type), corona = type === 'total' || type === 'hybrid';
  const lw = (100 / (corona ? 95 : 130)) * 1.2;
  let defs = '', lines = '';
  for (let j = 0; j < n; j++) {
    const v = j / n, ang = v * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
    let env = 1, reach: number, a: number, start = g.R;
    if (corona) {
      const streamer = Math.pow(0.5 + 0.5 * Math.sin(ang * 2 + wave(t * 0.12, 1.3) * 1.2), 3) * 0.9 + Math.pow(0.5 + 0.5 * Math.sin(ang * 3 - t * 0.05 + 2), 6) * 0.6;
      if (type === 'hybrid') env = Math.max(0, Math.min(1, (0.25 - dx) / 1.05));
      reach = g.R * (0.3 + 0.75 * streamer + 0.2 * (0.5 + 0.5 * Math.sin(v * 37 + t * 0.4))) * (1 + 0.14 * wave(t * 0.35, v * 6));
      a = (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(v * 23 - t * 0.6 + wave(t * 0.25, v * 3) * 1.5))) * (0.55 + 0.6 * streamer) * env;
      start = g.R * 1.02;
    } else if (type === 'annular') {
      reach = g.R * (0.16 + 0.18 * (0.5 + 0.5 * Math.sin(v * 29 + t * 0.5)) + 0.07 * wave(t * 0.3, v * 5));
      a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(v * 17 - t * 0.7 + wave(t * 0.2, v * 4)));
    } else {
      const px = dx * g.R, py = dy * g.R, d = Math.hypot(px - g.mx, py - g.my);
      env = Math.max(0, Math.min(1, (d - g.mr) / (g.R * 0.25)));
      reach = g.R * (0.16 + 0.18 * (0.5 + 0.5 * Math.sin(v * 31 + t * 0.45)) + 0.06 * wave(t * 0.3, v * 5));
      a = (0.35 + 0.4 * (0.5 + 0.5 * Math.sin(v * 19 - t * 0.6))) * env;
    }
    if (a < 0.02) continue;
    a = Math.min(1, a);
    reach = Math.min(reach, 47 - start);
    const sway = Math.sin(t * 0.21 + v * 11) * 0.012, ex = Math.cos(ang + sway), ey = Math.sin(ang + sway);
    const x0 = dx * start * 0.98, y0 = dy * start * 0.98, x1 = ex * (start + reach), y1 = ey * (start + reach);
    const gid = `${id}r${j}`;
    defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f2(x0)}" y1="${f2(y0)}" x2="${f2(x1)}" y2="${f2(y1)}">` +
      `<stop offset="0" stop-color="rgb(${LIGHT})" stop-opacity="${f2(a * 0.35)}"/><stop offset="0.12" stop-color="rgb(${LIGHT})" stop-opacity="${f2(a)}"/>` +
      `<stop offset="0.4" stop-color="rgb(${LIGHT})" stop-opacity="${f2(a * 0.45)}"/><stop offset="0.75" stop-color="rgb(${LIGHT})" stop-opacity="${f2(a * 0.1)}"/>` +
      `<stop offset="1" stop-color="rgb(${LIGHT})" stop-opacity="0"/></linearGradient>`;
    lines += `<line x1="${f2(x0)}" y1="${f2(y0)}" x2="${f2(x1)}" y2="${f2(y1)}" stroke="url(#${gid})" stroke-width="${f2(lw)}" stroke-linecap="round"/>`;
  }
  return `<defs>${defs}</defs><g filter="url(#${id}rb)">${lines}</g>`;
}

/** An eclipse icon on a 100x100 canvas centred on 0,0. `bg` paints the ink square behind it. */
export function eclipseIcon(type: EclipseType, size = 64, bg = true, id = 'ec'): string {
  const g = geo(type), corona = type === 'total' || type === 'hybrid';
  const n = size <= 128 ? 48 : corona ? 150 : 120;   // small icons need far fewer rays, and stay light to draw in long lists
  const defs =
    `<filter id="${id}b1" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${type === 'total' ? 6 : 5.5}"/></filter>` +
    `<filter id="${id}b2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.9"/></filter>` +
    `<filter id="${id}b3" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.35"/></filter>` +
    `<filter id="${id}rb" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.3"/></filter>` +
    `<radialGradient id="${id}sun" r="0.5"><stop offset="0" stop-color="${SUN}"/><stop offset="0.85" stop-color="rgb(${LIGHT})"/><stop offset="1" stop-color="#D8D1C1"/></radialGradient>` +
    `<radialGradient id="${id}bead" r="0.5"><stop offset="0" stop-color="${SUN}"/><stop offset="0.35" stop-color="${SUN}" stop-opacity="0.8"/><stop offset="1" stop-color="${SUN}" stop-opacity="0"/></radialGradient>`;
  let art: string;
  if (type === 'total') {
    art = `<circle r="${f2(g.R * 1.06)}" fill="rgb(${LIGHT})" opacity="0.45" filter="url(#${id}b1)"/>` +
      `<circle r="${f2(g.R * 1.03)}" fill="none" stroke="rgb(${LIGHT})" stroke-width="${f2(g.R * 0.16)}" opacity="0.4" filter="url(#${id}b2)"/>` +
      rays(type, id, n) +
      `<circle r="${f2(g.R * 1.035)}" fill="none" stroke="rgb(${LIGHT})" stroke-width="${f2(g.R * 0.075)}" filter="url(#${id}b3)"/>`;
  } else {
    const glow = type === 'partial' ? 0.3 : 0.42;
    art = `<circle r="${f2(g.R * 1.02)}" fill="rgb(${LIGHT})" opacity="${glow}" filter="url(#${id}b1)"/>` +
      `<circle r="${f2(g.R * 1.01)}" fill="rgb(${LIGHT})" opacity="${f2(glow * 0.8)}" filter="url(#${id}b2)"/>` +
      rays(type, id, n) +
      `<circle r="${g.R}" fill="url(#${id}sun)"/>`;
  }
  art += `<circle cx="${g.mx}" cy="${g.my}" r="${f2(g.mr)}" fill="${INK}"/>`;
  // The diamond ring's last bead of light: a soft gradient dot, no filter (filters on tiny shapes draw a box in some browsers).
  if (type === 'total') art += `<circle cx="${f2(g.R * 0.72)}" cy="${f2(-g.R * 0.69)}" r="${f2(g.R * 0.085)}" fill="url(#${id}bead)"/>`;
  const label = `${type[0].toUpperCase() + type.slice(1)} solar eclipse`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-50 -50 100 100" role="img" aria-label="${label}">` +
    `<title>${label}</title><defs>${defs}</defs>` +
    (bg ? `<rect x="-50" y="-50" width="100" height="100" rx="22" fill="${INK}"/>` : '') + art + `</svg>`;
}
