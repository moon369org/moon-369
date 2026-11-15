// Every solar eclipse from 2000 BCE to 3000 CE (astronomical years -1999 to 3000), the span of
// NASA's Five Millennium Canon of Solar Eclipses.
//
// Method: Meeus, Astronomical Algorithms (2nd ed.), chapter 54. For each new moon near a lunar
// node it finds the instant of greatest eclipse (TT), gamma (how far the shadow axis passes from
// Earth's center, in Earth radii) and u (the umbral cone's radius), which decide the type:
//   total     the moon covers the whole sun somewhere on Earth
//   annular   the moon is too far away to cover it, leaving a ring of fire
//   hybrid    total along part of the path and annular along the rest
//   partial   only the penumbra touches Earth
// TT is turned into UT with the Espenak-Meeus polynomials for Delta T (NASA's canon uses the same).
// Saros series come from the saros/inex lattice, anchored on 8 April 2024 (Saros 139).

import { toMoon, formatMoonmark, unixNsToIso } from './moon.js';
import { eclipseIcon } from './eclipse-icon.js';
import { LOGO } from './night.js';

export type EclipseType = 'total' | 'annular' | 'hybrid' | 'partial';

export interface Eclipse {
  k: number;              // Meeus lunation number (0 = new moon of 6 January 2000)
  jd_ut: number;          // Julian Day (UT) of greatest eclipse
  ms: number;             // Unix milliseconds of greatest eclipse
  type: EclipseType;
  central: boolean;       // the shadow axis touches Earth (false for partial and the rare non-central total/annular)
  gamma: number;
  magnitude: number | null; // fraction of the sun's diameter covered at greatest eclipse (partials)
  saros: number;
  delta_t: number;        // seconds
  y: number; mo: number; d: number; calendar: 'julian' | 'gregorian';   // the date by Terrestrial Time, as NASA lists them
  jde: number;            // Julian Ephemeris Day (TT) of greatest eclipse
}

const RAD = Math.PI / 180;
const sin = (x: number) => Math.sin(x * RAD), cos = (x: number) => Math.cos(x * RAD);
const norm = (x: number) => ((x % 360) + 360) % 360;

/** Delta T (TT - UT) in seconds, Espenak & Meeus (NASA), valid -1999 to 3000. */
export function deltaT(year: number): number {
  const y = year;
  if (y < -500) { const u = (y - 1820) / 100; return -20 + 32 * u * u; }
  if (y < 500) { const u = y / 100; return 10583.6 - 1014.41 * u + 33.78311 * u ** 2 - 5.952053 * u ** 3 - 0.1798452 * u ** 4 + 0.022174192 * u ** 5 + 0.0090316521 * u ** 6; }
  if (y < 1600) { const u = (y - 1000) / 100; return 1574.2 - 556.01 * u + 71.23472 * u ** 2 + 0.319781 * u ** 3 - 0.8503463 * u ** 4 - 0.005050998 * u ** 5 + 0.0083572073 * u ** 6; }
  if (y < 1700) { const t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t ** 2 + t ** 3 / 7129; }
  if (y < 1800) { const t = y - 1700; return 8.83 + 0.1603 * t - 0.0059285 * t ** 2 + 0.00013336 * t ** 3 - t ** 4 / 1174000; }
  if (y < 1860) { const t = y - 1800; return 13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3 - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7; }
  if (y < 1900) { const t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
  if (y < 1920) { const t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { const t = y - 1920; return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3; }
  if (y < 1961) { const t = y - 1950; return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547; }
  if (y < 1986) { const t = y - 1975; return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718; }
  if (y < 2005) { const t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y < 2050) { const t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t ** 2; }
  if (y < 2150) return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
  const u = (y - 1820) / 100; return -20 + 32 * u * u;
}

/** Calendar date of a Julian Day: Julian calendar before 15 October 1582, Gregorian after (as NASA lists them). */
export function jdToDate(jd: number): { y: number; mo: number; d: number; frac: number; calendar: 'julian' | 'gregorian' } {
  const z = Math.floor(jd + 0.5), f = jd + 0.5 - z;
  let A = z;
  const greg = z >= 2299161;
  if (greg) { const a = Math.floor((z - 1867216.25) / 36524.25); A = z + 1 + a - Math.floor(a / 4); }
  const B = A + 1524, C = Math.floor((B - 122.1) / 365.25), D = Math.floor(365.25 * C), E = Math.floor((B - D) / 30.6001);
  const dd = B - D - Math.floor(30.6001 * E) + f;
  const mo = E < 14 ? E - 1 : E - 13, y = mo > 2 ? C - 4716 : C - 4715;
  return { y, mo, d: Math.floor(dd), frac: dd - Math.floor(dd), calendar: greg ? 'gregorian' : 'julian' };
}

const JD_UNIX = 2440587.5;
const SAROS_ANCHOR_K = 300, SAROS_ANCHOR = 139;   // 8 April 2024
const INV358 = (() => { for (let i = 1; i < 223; i++) if ((358 * i) % 223 === 1) return i; return 0; })();

function sarosOf(k: number): number {
  // k - k0 = 223a + 358b, and each step of 358 lunations (an inex) moves to the next saros.
  const dk = k - SAROS_ANCHOR_K;
  let b = (((dk % 223) * INV358) % 223 + 223) % 223;
  if (SAROS_ANCHOR + b > 190) b -= 223;    // saros numbers in this span run from about -13 to 190
  return SAROS_ANCHOR + b;
}

function at(k: number): Eclipse | null {
  const T = k / 1236.85;
  const F = norm(160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4);
  if (Math.abs(sin(F)) > 0.36) return null;
  const jde0 = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const M = norm(2.5534 + 29.1053567 * k - 0.0000014 * T * T - 0.00000011 * T ** 3);
  const Mp = norm(201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4);
  const Om = norm(124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const F1 = F - 0.02665 * sin(Om);
  const A1 = 299.77 + 0.107408 * k - 0.009173 * T * T;
  const jde = jde0 - 0.4075 * sin(Mp) + 0.1721 * E * sin(M) + 0.0161 * sin(2 * Mp) - 0.0097 * sin(2 * F1) + 0.0073 * E * sin(Mp - M)
    - 0.005 * E * sin(Mp + M) - 0.0023 * sin(Mp - 2 * F1) + 0.0021 * E * sin(2 * M) + 0.0012 * sin(Mp + 2 * F1) + 0.0006 * E * sin(2 * Mp + M)
    - 0.0004 * sin(3 * Mp) - 0.0003 * E * sin(M + 2 * F1) + 0.0003 * sin(A1) - 0.0002 * E * sin(M - 2 * F1) - 0.0002 * E * sin(2 * Mp - M) - 0.0002 * sin(Om);
  const P = 0.207 * E * sin(M) + 0.0024 * E * sin(2 * M) - 0.0392 * sin(Mp) + 0.0116 * sin(2 * Mp) - 0.0073 * E * sin(Mp + M) + 0.0067 * E * sin(Mp - M) + 0.0118 * sin(2 * F1);
  const Q = 5.2207 - 0.0048 * E * cos(M) + 0.002 * E * cos(2 * M) - 0.3299 * cos(Mp) - 0.006 * E * cos(Mp + M) + 0.0041 * E * cos(Mp - M);
  const W = Math.abs(cos(F1));
  const gamma = (P * cos(F1) + Q * sin(F1)) * (1 - 0.0048 * W);
  const u = 0.0059 + 0.0046 * E * cos(M) - 0.0182 * cos(Mp) + 0.0004 * cos(2 * Mp) - 0.0005 * cos(M + Mp);
  const g = Math.abs(gamma);
  if (g > 1.5433 + u) return null;
  let type: EclipseType, central = true, magnitude: number | null = null;
  if (g < 0.9972) {
    if (u < 0) type = 'total';
    else if (u > 0.0047) type = 'annular';
    else type = u < 0.00464 * Math.sqrt(1 - gamma * gamma) ? 'hybrid' : 'annular';
  } else if (g < 0.9972 + Math.abs(u)) {
    central = false; type = u < 0 ? 'total' : 'annular';
  } else {
    central = false; type = 'partial';
    magnitude = Math.round(((1.5433 + u - g) / (0.5461 + 2 * u)) * 1000) / 1000;
  }
  const approx = jdToDate(jde);
  const dt = deltaT(approx.y + (approx.mo - 0.5) / 12);
  const jd_ut = jde - dt / 86400;
  const c = jdToDate(jde);   // NASA dates each eclipse by TT; in ancient times that can be a day after the UT date
  return {
    k, jd_ut, ms: Math.round((jd_ut - JD_UNIX) * 86400000), type, central, gamma: Math.round(gamma * 10000) / 10000, magnitude,
    saros: sarosOf(k), delta_t: Math.round(dt), jde, y: c.y, mo: c.mo, d: c.d, calendar: c.calendar,
  };
}

let ALL: Eclipse[] | null = null;
/** All solar eclipses, -1999 to 3000, in time order. Computed once (a few milliseconds). */
export function allEclipses(): Eclipse[] {
  if (ALL) return ALL;
  const out: Eclipse[] = [];
  const k0 = Math.floor((-1999 - 2000) * 12.3685) - 2, k1 = Math.ceil((3001 - 2000) * 12.3685) + 2;
  for (let k = k0; k <= k1; k++) { const e = at(k); if (e && e.y >= -1999 && e.y <= 3000) out.push(e); }
  return (ALL = out);
}

export const ymdOf = (e: Pick<Eclipse, 'y' | 'mo' | 'd'>) => `${e.y < 0 ? '-' + String(-e.y).padStart(4, '0') : String(e.y).padStart(4, '0')}-${String(e.mo).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`;

/** Time of greatest eclipse by TT (NASA's "TD of greatest eclipse"). */
export function tdTime(e: Eclipse): string {
  const f = (((e.jde + 0.5) % 1) + 1) % 1, s = Math.round(f * 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Binary search: index of the first eclipse at or after ms. */
export function indexAfter(ms: number): number {
  const a = allEclipses();
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].ms < ms) lo = m + 1; else hi = m; }
  return lo;
}

// ---------- public view, share card ----------

export const ECLIPSE_TYPES: EclipseType[] = ['total', 'annular', 'hybrid', 'partial'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export const yearLabel = (y: number) => (y <= 0 ? `${1 - y} BCE` : String(y));

export function publicEclipse(e: Eclipse) {
  const ns = BigInt(e.ms) * 1_000_000n, t = toMoon(ns), date = ymdOf(e);
  return {
    date, calendar: e.calendar, year_label: yearLabel(e.y),
    greatest_eclipse_td: tdTime(e), utc: unixNsToIso(ns), unix_ms: e.ms,
    type: e.type, central: e.central, gamma: e.gamma, magnitude: e.magnitude, saros: e.saros, delta_t_s: e.delta_t,
    moonmark: formatMoonmark(t, 0), cycle: t.year, moon: t.moon, lune: t.day,
    icon: `https://api.moon369.org/v1/eclipse.svg?type=${e.type}`,
    page: `https://moon369.org/eclipse/${date}`,
  };
}

export function eclipseByDate(date: string): Eclipse | null {
  const m = /^(-?\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  return allEclipses().find((e) => e.y === y && e.mo === mo && e.d === d) ?? null;
}

const INK = '#0B0B0D', PAPER = '#E9E4D8', ASH = '#8A8B8F', LINE = '#24262A', SOFT = '#B9B6AE';
const TITLE: Record<EclipseType, string> = { total: 'TOTAL SOLAR ECLIPSE', annular: 'ANNULAR SOLAR ECLIPSE', hybrid: 'HYBRID SOLAR ECLIPSE', partial: 'PARTIAL SOLAR ECLIPSE' };

/** 1200x630 share card for one eclipse. */
export function eclipseCardSvg(e: Eclipse): string {
  const p = publicEclipse(e), pad2 = (n: number) => String(n).padStart(2, '0');
  const date = `${e.d} ${MONTHS[e.mo - 1]} ${yearLabel(e.y)}`;
  const dfs = Math.min(56, Math.floor(560 / (date.length * 0.92)));
  const sub = `GREATEST ECLIPSE ${p.greatest_eclipse_td.slice(0, 5)} TT  ·  SAROS ${e.saros}`;
  const icon = eclipseIcon(e.type, 470, false, 'cd').replace('<svg ', '<svg x="40" y="80" ');
  const cells: [string, string][] = [['CYCLE', String(p.cycle)], ['MOON', pad2(p.moon)], ['LUNE', pad2(p.lune)]];
  const cw = 176, gx = 580, gy = 330;
  const grid = `<path d="M${gx} ${gy}H${gx + cw * 3}M${gx} ${gy + 90}H${gx + cw * 3}M${gx + cw} ${gy}V${gy + 90}M${gx + 2 * cw} ${gy}V${gy + 90}" stroke="${LINE}" stroke-width="2" fill="none"/>` +
    cells.map(([k, v], i) => `<text x="${gx + cw * i + 22}" y="${gy + 32}" font-family="JetBrains Mono" font-size="15" letter-spacing="4" fill="${ASH}">${k}</text>` +
      `<text x="${gx + cw * i + 22}" y="${gy + 74}" font-family="Syncopate" font-weight="700" font-size="${v.length > 5 ? 26 : 34}" letter-spacing="1.5" fill="${PAPER}">${v}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<rect width="1200" height="630" fill="${INK}"/>` + icon +
    `<text x="580" y="140" font-family="JetBrains Mono" font-size="19" letter-spacing="5" fill="${ASH}">${TITLE[e.type]}</text>` +
    `<text x="576" y="214" font-family="Syncopate" font-weight="700" font-size="${dfs}" letter-spacing="2" fill="${PAPER}">${date}</text>` +
    `<text x="580" y="274" font-family="JetBrains Mono" font-size="19" letter-spacing="3" fill="${SOFT}">${sub}</text>` + grid +
    `<text x="580" y="472" font-family="JetBrains Mono" font-size="16" letter-spacing="3" fill="${ASH}">${e.central ? 'CENTRAL' : 'NON-CENTRAL'} · GAMMA ${e.gamma.toFixed(4)}${e.magnitude !== null ? ` · MAGNITUDE ${e.magnitude.toFixed(3)}` : ''}</text>` +
    LOGO(580, 532, 130) +
    `<text x="1108" y="567" font-family="JetBrains Mono" font-size="17" letter-spacing="3" fill="${ASH}" text-anchor="end">MOON369.ORG/ECLIPSES</text>` +
    `</svg>`;
}
