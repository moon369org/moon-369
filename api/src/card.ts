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
  const foot = esc(`${d.name.toUpperCase()} · ${(d.illumination * 100).toFixed(1)}% LIT · LUNE ${d.lune} OF ${d.lunesInMoon}`);
  const label = esc(`Year ${d.year}, Moon ${pad2(d.moon)}, Lune ${pad2(d.lune)}. ${d.name}, ${(d.illumination * 100).toFixed(1)}% lit.`);
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

export interface ShareData extends CardData { time: string; ns: string }

/** A 1200x630 share image for one Moonmark (X, iMessage, Slack and other link previews). */
export function shareSvg(d: ShareData): string {
  const pct = (d.illumination * 100).toFixed(1);
  const nsG = '.' + d.ns.slice(0, 3) + ' ' + d.ns.slice(3, 6) + ' ' + d.ns.slice(6, 9);
  const cells = [['YEAR', String(d.year)], ['MOON', pad2(d.moon)], ['LUNE', pad2(d.lune)]];
  const cw = 176;
  const grid = cells.map(([k, v], i) => {
    const x = 560 + cw * i;
    const fs = v.length > 5 ? Math.max(22, 34 - (v.length - 5) * 4) : 34;
    return `<text x="${x + 22}" y="452" font-family="JetBrains Mono" font-size="15" letter-spacing="4" fill="${ASH}">${k}</text>` +
      `<text x="${x + 22}" y="500" font-family="Syncopate" font-weight="700" font-size="${fs}" letter-spacing="1.5" fill="${PAPER}">${esc(v)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PAPER}" stop-opacity="0.09"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="1200" height="630" fill="${INK}"/>` +
    `<svg x="66" y="62" width="148" height="42" viewBox="-10 -10 424 120"><path d="M4,100 V4 L48,64 L92,4 V100" fill="none" stroke="#E9E4D8" stroke-width="8" stroke-linejoin="bevel"/><path d="M312,100 V4 L400,96 V0" fill="none" stroke="#E9E4D8" stroke-width="8" stroke-linejoin="bevel"/><defs><mask id="mwA" maskUnits="userSpaceOnUse" x="-10" y="-10" width="424" height="120"><rect x="-10" y="-10" width="424" height="120" fill="#fff"/><circle cx="232.0" cy="50" r="46" fill="none" stroke="#000" stroke-width="18"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#fff" stroke-width="18"/></mask><mask id="mwB" maskUnits="userSpaceOnUse" x="-10" y="-10" width="424" height="120"><rect x="-10" y="-10" width="424" height="120" fill="#fff"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#000" stroke-width="18"/></mask></defs><circle cx="172.0" cy="50" r="46" fill="none" stroke="#E9E4D8" stroke-width="8" mask="url(#mwA)"/><circle cx="232.0" cy="50" r="46" fill="none" stroke="#E9E4D8" stroke-width="8" mask="url(#mwB)"/></svg>` +
    `<circle cx="290" cy="345" r="250" fill="url(#g)"/>` +
    `<g transform="translate(290,345)"><circle r="150" fill="${SHADOW}"/><path d="${phasePath(d.fraction, 150)}" fill="${PAPER}"/></g>` +
    `<text x="560" y="150" font-family="JetBrains Mono" font-size="18" letter-spacing="7" fill="${ASH}">${esc((d.title ?? 'MOONMARK').toUpperCase())}</text>` +
    `<text x="556" y="232" font-family="JetBrains Mono" font-size="64" fill="${PAPER}">${d.year}.${pad2(d.moon)}.${pad2(d.lune)}</text>` +
    `<text x="556" y="310" font-family="JetBrains Mono" font-size="64" fill="${PAPER}">${esc(d.time)}</text>` +
    `<text x="560" y="362" font-family="JetBrains Mono" font-size="34" fill="${ASH}">${nsG}</text>` +
    `<path d="M560 412H1088M560 528H1088M${560 + cw} 412V528M${560 + 2 * cw} 412V528" stroke="${LINE}" stroke-width="2" fill="none"/>` +
    grid +
    `<text x="560" y="584" font-family="JetBrains Mono" font-size="17" letter-spacing="3" fill="#B9B6AE">${esc(d.name.toUpperCase())} · ${pct}% LIT</text>` +
    `<text x="1088" y="584" font-family="JetBrains Mono" font-size="17" letter-spacing="3" fill="${ASH}" text-anchor="end">MOON369.ORG</text>` +
    `</svg>`;
}
