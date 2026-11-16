// How closely Moon's lunations track the real Moon.
//
// Moon divides time into equal lunations of LUNATION_NS (29.530588853 days), counted from the real new moon of
// 6 January 2000, 18:14 UTC. The real Moon's new moons wobble around that grid by up to about 14 hours, because its
// orbit is elliptical and perturbed by the Sun. The grid DRIFTS only if the average of that wobble moves.
//
// True new moons: Meeus, Astronomical Algorithms (2nd ed.), chapter 49, all periodic and planetary terms (accurate
// to well under a minute for modern dates). Converted to UTC with Espenak & Meeus Delta T, as the eclipse tables are.
import { EPOCH_UNIX_NS, LUNATION_NS } from './moon.js';
import { deltaT } from './eclipses.js';

const RAD = Math.PI / 180;
const s = (x: number) => Math.sin(x * RAD);

/** Lunation number of Moon's grid at Meeus lunation k (Meeus k = 0 is the new moon of 6 January 2000). */
export const GRID_OFFSET = 24_736;

/** The true new moon of Meeus lunation k, as Julian Ephemeris Day (TT). */
export function trueNewMoonJde(k: number): number {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
  jde += -0.4072 * s(Mp) + 0.17241 * E * s(M) + 0.01608 * s(2 * Mp) + 0.01039 * s(2 * F) + 0.00739 * E * s(Mp - M)
    - 0.00514 * E * s(Mp + M) + 0.00208 * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F)
    + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
    - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O) - 0.00007 * s(Mp + 2 * M) + 0.00004 * s(2 * Mp - 2 * F)
    + 0.00004 * s(3 * M) + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F)
    + 0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
  const A = [299.77 + 0.107408 * k - 0.009173 * T2, 251.88 + 0.016321 * k, 251.83 + 26.651886 * k, 349.42 + 36.412478 * k,
    84.66 + 18.206239 * k, 141.74 + 53.303771 * k, 207.14 + 2.453732 * k, 154.84 + 7.30686 * k, 34.52 + 27.261239 * k,
    207.19 + 0.121824 * k, 291.34 + 1.844379 * k, 161.72 + 24.198154 * k, 239.56 + 25.513099 * k, 331.55 + 3.592518 * k];
  const W = [0.000325, 0.000165, 0.000164, 0.000126, 0.00011, 0.000062, 0.00006, 0.000056, 0.000047, 0.000042, 0.00004, 0.000037, 0.000035, 0.000023];
  for (let i = 0; i < 14; i++) jde += W[i] * s(A[i]);
  return jde;
}

/** The true new moon of Meeus lunation k, in Unix milliseconds (UTC). */
export function trueNewMoonMs(k: number): number {
  const jde = trueNewMoonJde(k), year = 2000 + (jde - 2451545) / 365.25;
  return (jde - deltaT(year) / 86400 - 2440587.5) * 86_400_000;
}

/** Where Moon's grid puts the same lunation, in Unix milliseconds. */
export const gridNewMoonMs = (k: number): number => Number((EPOCH_UNIX_NS + BigInt(k + GRID_OFFSET) * LUNATION_NS) / 1_000_000n);

/** Real new moon minus Moon's grid, in hours, for Meeus lunation k. Positive: the real new moon came later. */
export const gapHours = (k: number): number => (trueNewMoonMs(k) - gridNewMoonMs(k)) / 3_600_000;

/** Meeus lunation k nearest a Unix time in ms. */
export const lunationNear = (ms: number): number => Math.round((ms / 86_400_000 + 2440587.5 - 2451550.09766) / 29.530588861);

const J2000_MS = Date.UTC(2000, 0, 1);

export interface DriftCentury { from_year: number; lunations: number; mean_gap_h: number; min_gap_h: number; max_gap_h: number }

/** The average gap, century by century: if Moon's grid drifted from the Moon, the averages would walk away from each other. */
export function driftByCentury(fromYear = -2000, toYear = 3000): DriftCentury[] {
  const out: DriftCentury[] = [];
  for (let y = fromYear; y < toYear; y += 100) {
    const at = (yr: number) => lunationNear(J2000_MS + (yr - 2000) * 365.2425 * 86_400_000);   // years from 2000 (Date.UTC reads year 0 as 1900)
    const a = at(y), b = at(y + 100);
    let sum = 0, mn = Infinity, mx = -Infinity;
    for (let k = a; k < b; k++) { const g = gapHours(k); sum += g; if (g < mn) mn = g; if (g > mx) mx = g; }
    const r = (x: number) => Math.round(x * 100) / 100;
    out.push({ from_year: y, lunations: b - a, mean_gap_h: r(sum / (b - a)), min_gap_h: r(mn), max_gap_h: r(mx) });
  }
  return out;
}
