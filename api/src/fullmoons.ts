// Exact full moons: the instant the Moon is opposite the Sun in ecliptic longitude.
// Meeus, Astronomical Algorithms (2nd ed.), ch. 49 "Phases of the Moon": mean phase plus periodic
// and planetary corrections, good to well under a minute. Times come out in Terrestrial Time and are
// turned into UTC with the Espenak-Meeus Delta T used for Moon's eclipses.
import { deltaT } from './eclipses.js';
import { toMoon, formatMoonmark, illumination, moonDistanceKm, SUPERMOON_KM } from './moon.js';

const rad = Math.PI / 180;
const sin = (d: number) => Math.sin(d * rad);
const JD_UNIX = 2440587.5;
const LUNATION_DAYS = 29.530588861;

/** Julian Ephemeris Day (TT) of the full moon with lunation number k + 0.5 (k = 0 is the full moon of Jan 2000). */
export function fullMoonJDE(k: number): number {
  const kk = k + 0.5, T = kk / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + LUNATION_DAYS * kk + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2, E2 = E * E;
  const M = 2.5534 + 29.1053567 * kk - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * kk + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * kk - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const Om = 124.7746 - 1.56375588 * kk + 0.0020672 * T2 + 0.00000215 * T3;
  jde += -0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F)
    + 0.00734 * E * sin(Mp - M) - 0.00515 * E * sin(Mp + M) + 0.00209 * E2 * sin(2 * M)
    - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
    - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
    - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M)
    + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
    + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F)
    - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  const A = [
    [0.000325, 299.77 + 0.107408 * kk - 0.009173 * T2], [0.000165, 251.88 + 0.016321 * kk], [0.000164, 251.83 + 26.651886 * kk],
    [0.000126, 349.42 + 36.412478 * kk], [0.00011, 84.66 + 18.206239 * kk], [0.000062, 141.74 + 53.303771 * kk],
    [0.00006, 207.14 + 2.453732 * kk], [0.000056, 154.84 + 7.30686 * kk], [0.000047, 34.52 + 27.261239 * kk],
    [0.000042, 207.19 + 0.121824 * kk], [0.00004, 291.34 + 1.844379 * kk], [0.000037, 161.72 + 24.198154 * kk],
    [0.000035, 239.56 + 25.513099 * kk], [0.000023, 331.55 + 3.592518 * kk],
  ];
  for (const [c, a] of A) jde += c * sin(a);
  return jde;
}

/** Unix milliseconds (UTC) of full moon k. */
export function fullMoonMs(k: number): number {
  const jde = fullMoonJDE(k);
  const year = 2000 + (k + 0.5) / 12.3685;
  return Math.round((jde - JD_UNIX) * 86400 - deltaT(year)) * 1000; // whole seconds: the method is good to about ±20 s
}

/** Lunation number of the first full moon at or after this moment. */
export function fullMoonIndexAfter(ms: number): number {
  let k = Math.floor((ms / 86400000 + JD_UNIX - 2451550.09766) / LUNATION_DAYS - 0.5) - 1;
  while (fullMoonMs(k) < ms) k++;
  return k;
}

export const FULL_MOON_RANGE = { from: -2000, to: 4000 }; // years where Meeus ch. 49 and Delta T are meaningful

export function publicFullMoon(k: number) {
  const ms = fullMoonMs(k), ns = BigInt(ms) * 1_000_000n, km = moonDistanceKm(ns);
  return {
    utc: new Date(ms).toISOString().replace('.000Z', 'Z'),
    unix_ms: ms,
    moonmark: formatMoonmark(toMoon(ns), 0),
    illumination: Math.round(illumination(ns) * 100000) / 1000,
    distance_km: Math.round(km),
    supermoon: km <= SUPERMOON_KM,
    lunation: k,
  };
}

/** Full moons whose UTC date falls in a calendar month (1 or 2). */
export function fullMoonsInMonth(y: number, mo: number) {
  const at = (yy: number, m: number) => { const d = new Date(0); d.setUTCFullYear(yy, m, 1); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
  const start = at(y, mo - 1), end = at(y, mo);
  const out = [];
  for (let k = fullMoonIndexAfter(start); fullMoonMs(k) < end; k++) out.push(publicFullMoon(k));
  return out;
}
