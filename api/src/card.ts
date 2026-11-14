// The "Today on Moon" card as a standalone SVG. Fonts are embedded so it renders
// the same inside an <img>, where external fonts and scripts never load.
import { SYNCOPATE_700_WOFF2, JETBRAINS_MONO_400_WOFF2 } from './card-fonts.js';

export interface CardData {
  year: number; moon: number; lune: number; lunesInMoon: number;
  fraction: number;      // real moon phase: 0 new, 0.5 full
  illumination: number;  // 0..1
  name: string;          // e.g. "Waxing crescent"
  title?: string;        // top label, default "TODAY ON MOON"
}

const INK = '#0B0B0D', PAPER = '#E9E4D8', ASH = '#8A8B8F', LINE = '#24262A', SHADOW = '#26272B';
const pad2 = (n: number) => String(n).padStart(2, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The lit part of the moon as a path, centered on 0,0 with radius r. Same math as the site. */
export function phasePath(f: number, r: number): string {
  const k = Math.cos(2 * Math.PI * f), waxing = f < 0.5;
  const outer = waxing ? 1 : 0, inner = (waxing === (k > 0)) ? 0 : 1, rx = Math.abs(k) * r;
  return `M0,-${r} A${r},${r} 0 0 ${outer} 0,${r} A${rx.toFixed(3)},${r} 0 0 ${inner} 0,-${r}Z`;
}

export function cardSvg(d: CardData, size = 600): string {
  const title = esc((d.title ?? 'TODAY ON MOON').toUpperCase());
  const foot = esc(`${d.name.toUpperCase()} · ${Math.round(d.illumination * 100)}% LIT · LUNE ${d.lune} OF ${d.lunesInMoon}`);
  const label = esc(`Year ${d.year}, Moon ${pad2(d.moon)}, Lune ${pad2(d.lune)}. ${d.name}, ${Math.round(d.illumination * 100)}% lit.`);
  const cols = [['YEAR', String(d.year)], ['MOON', pad2(d.moon)], ['LUNE', pad2(d.lune)]];
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
    `.t{font-family:MoonMono,ui-monospace,monospace;font-size:17px;letter-spacing:6px;fill:${ASH};text-anchor:middle}` +
    `.k{font-family:MoonMono,ui-monospace,monospace;font-size:13px;letter-spacing:4px;fill:${ASH};text-anchor:middle}` +
    `.v{font-family:MoonSync,'Arial Black',sans-serif;font-weight:700;letter-spacing:2px;fill:${PAPER};text-anchor:middle}` +
    `.f{font-family:MoonMono,ui-monospace,monospace;font-size:13px;letter-spacing:2.6px;fill:#B9B6AE;text-anchor:middle}` +
    `</style>` +
    `<radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PAPER}" stop-opacity="0.07"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect width="600" height="600" rx="24" fill="${INK}"/>` +
    `<rect x="0.5" y="0.5" width="599" height="599" rx="23.5" fill="none" stroke="${LINE}"/>` +
    `<text x="300" y="84" class="t">${title}</text>` +
    `<circle cx="300" cy="226" r="118" fill="url(#g)"/>` +
    `<g transform="translate(300,226)"><circle r="56" fill="${SHADOW}"/><path d="${phasePath(d.fraction, 56)}" fill="${PAPER}"/></g>` +
    `<path d="M48 380H552M48 512H552M${48 + colW} 380V512M${48 + 2 * colW} 380V512" stroke="${LINE}" stroke-width="1.5" fill="none"/>` +
    cells +
    `<text x="300" y="560" class="f">${foot}</text>` +
    `</svg>`;
}
