// Eclipse icons, one per type, in Moon's colours (cream light on ink). Pure SVG, no fonts, so they
// work in an <img>, as a favicon, in link previews and in resvg.
//   total    the moon covers the sun: a black disc inside a glowing corona
//   annular  the moon is too small: a ring of fire around a black disc
//   hybrid   total along part of the path, annular along the rest: corona on one side, ring on the other
//   partial  the moon takes a bite out of the sun
import type { EclipseType } from './eclipses.js';

const INK = '#0B0B0D', PAPER = '#E9E4D8', SUN = '#F4EFE3';

function corona(id: string, r: number, count: number, len: number, seed: number): string {
  let s = seed, out = '';
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.12, L = r + len * (0.45 + rnd() * 0.75), w = 0.9 + rnd() * 1.6;
    const x1 = Math.cos(a) * r * 0.98, y1 = Math.sin(a) * r * 0.98, x2 = Math.cos(a) * L, y2 = Math.sin(a) * L;
    out += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="url(#${id}ray)" stroke-width="${w.toFixed(2)}" stroke-linecap="round"/>`;
  }
  return out;
}

/** An eclipse icon on a 100x100 canvas centred on 0,0. `bg` paints the ink square behind it. */
export function eclipseIcon(type: EclipseType, size = 64, bg = true, id = 'ec'): string {
  const R = 26;   // the sun
  const defs =
    `<radialGradient id="${id}glow" r="0.5"><stop offset="0.5" stop-color="${PAPER}" stop-opacity="0.55"/><stop offset="0.62" stop-color="${PAPER}" stop-opacity="0.22"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}ray" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="48"><stop offset="0.5" stop-color="${PAPER}" stop-opacity="0.85"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}sun" r="0.5"><stop offset="0" stop-color="${SUN}"/><stop offset="0.85" stop-color="${PAPER}"/><stop offset="1" stop-color="#D8D1C1"/></radialGradient>` +
    `<filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
    `<filter id="${id}b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.7"/></filter>`;
  let art = '';
  if (type === 'total') {
    art = `<circle r="48" fill="url(#${id}glow)"/>` +
      `<g filter="url(#${id}b)">${corona(id, R, 28, 20, 7)}</g>` +
      `<circle r="${R + 1.6}" fill="none" stroke="${PAPER}" stroke-width="2.4" filter="url(#${id}b2)"/>` +
      `<circle r="${R}" fill="${INK}"/>` +
      `<circle cx="${(R * 0.72).toFixed(1)}" cy="${(-R * 0.69).toFixed(1)}" r="2.4" fill="${SUN}" filter="url(#${id}b2)"/>`;   // the diamond ring's last bead of light
  } else if (type === 'annular') {
    art = `<circle r="44" fill="url(#${id}glow)"/>` +
      `<circle r="${R + 1}" fill="url(#${id}sun)" filter="url(#${id}b2)"/>` +
      `<circle r="${R - 5.5}" fill="${INK}"/>`;
  } else if (type === 'hybrid') {
    // One shadow, two kinds of eclipse: the ring of fire on the right thins to nothing on the left,
    // where the moon just covers the sun and the corona shows.
    art = `<linearGradient id="${id}fade" x1="0" x2="1"><stop offset="0.12" stop-color="#fff"/><stop offset="0.62" stop-color="#000"/></linearGradient>` +
      `<mask id="${id}m"><rect x="-50" y="-50" width="100" height="100" fill="url(#${id}fade)"/></mask>` +
      `<circle r="46" fill="url(#${id}glow)"/>` +
      `<g mask="url(#${id}m)"><g filter="url(#${id}b)">${corona(id, R, 28, 19, 11)}</g></g>` +
      `<circle r="${R + 0.8}" fill="url(#${id}sun)" filter="url(#${id}b2)"/>` +
      `<circle cx="-1.9" r="${R - 1.1}" fill="${INK}"/>`;
  } else {
    art = `<circle r="42" fill="url(#${id}glow)" opacity="0.8"/>` +
      `<circle r="${R}" fill="url(#${id}sun)" filter="url(#${id}b2)"/>` +
      `<circle cx="13" cy="-11" r="${R + 0.5}" fill="${INK}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-50 -50 100 100" role="img" aria-label="${type} solar eclipse">` +
    `<title>${type[0].toUpperCase() + type.slice(1)} solar eclipse</title><defs>${defs}</defs>` +
    (bg ? `<rect x="-50" y="-50" width="100" height="100" rx="22" fill="${INK}"/>` : '') + art + `</svg>`;
}
