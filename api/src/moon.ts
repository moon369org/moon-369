/**
 * Moon time: the reference implementation.
 *
 * Every conversion runs on whole nanoseconds (BigInt) and the exact ratio
 * defined by the spec, so every implementation agrees to the last digit.
 *
 * Spec v1
 *   Mean synodic month (lunation) ... 29.530588853 SI days = 2,551,442,876,899,200 ns
 *   Cycle (Moon's year) .............. 13 lunations = 369 Moon days
 *   Moon day ......................... 24 h × 60 min × 60 s Moon time
 *   Moon second ...................... 13 × lunation ÷ (369 × 86,400) = 1.0403730490216802… SI s
 *   Epoch (Year 0, Moon 1, Day 1, 00:00:00)
 *     = first mean new moon of 0 AD, 0000-01-23 02:43:57.0214 UTC
 *     = reference new moon 2000-01-06 18:14 UTC minus 24,736 lunations
 *   Time base ........................ Unix time (no leap seconds)
 */

export const SPEC_VERSION = '1.0.0';

export const NS_PER_SECOND = 1_000_000_000n;
export const LUNATION_NS = 2_551_442_876_899_200n; // 29.530588853 × 86,400 × 10⁹
export const YEAR_DAYS = 369;
export const MOONS = 13;
export const SECONDS_PER_DAY = 86_400n;
export const MOON_DAY_NS = SECONDS_PER_DAY * NS_PER_SECOND; // in Moon nanoseconds

/** Moon ns = SI ns × NUM ÷ DEN */
export const NUM = BigInt(YEAR_DAYS) * SECONDS_PER_DAY * NS_PER_SECOND; // 31,881,600,000,000,000
export const DEN = BigInt(MOONS) * LUNATION_NS; // 33,168,757,399,689,600

/** Unix nanoseconds of Year 0, Moon 1, Day 1, 00:00:00. */
export const EPOCH_UNIX_NS = 947_182_440_000n * 1_000_000n - 24_736n * LUNATION_NS; // −62,165,308,562,978,611,200

export const MOON_SECOND_SI = Number(DEN) / Number(NUM); // 1.0403730490216803 (display only)

const floorDiv = (a: bigint, b: bigint): bigint => {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
};
const ceilDiv = (a: bigint, b: bigint): bigint => -floorDiv(-a, b);

/** First day-of-year (0-based) of moon index m (0-based). */
export const firstDayOfMoon = (m: number): number => Math.ceil((m * YEAR_DAYS) / MOONS);
/** Moon index (0-based) that day-of-year d (0-based) belongs to. */
export const moonOfDay = (d: number): number => Math.floor((d * MOONS) / YEAR_DAYS);
/** Length in days of moon number (1–13). */
export const moonLength = (moon: number): number => firstDayOfMoon(moon) - firstDayOfMoon(moon - 1);

export interface MoonTime {
  cycle: number;     // Moon's year, counted from cycle 0 (0 AD)
  year: number;      // same as cycle; kept for compatibility
  moon: number;      // 1–13
  day: number;       // 1–28 or 1–29
  dayOfYear: number; // 1–369
  dayOfCycle: number; // same as dayOfYear
  hour: number;
  minute: number;
  second: number;
  nanosecond: number;
  moonNs: bigint;    // Moon nanoseconds since the epoch
}

/** Unix nanoseconds → Moon nanoseconds since epoch (floor). */
export const unixNsToMoonNs = (unixNs: bigint): bigint => floorDiv((unixNs - EPOCH_UNIX_NS) * NUM, DEN);

/** Moon nanoseconds since epoch → the earliest Unix nanosecond that falls in it. */
export const moonNsToUnixNs = (moonNs: bigint): bigint => EPOCH_UNIX_NS + ceilDiv(moonNs * DEN, NUM);

export function fromMoonNs(moonNs: bigint): MoonTime {
  const dayIndex = floorDiv(moonNs, MOON_DAY_NS);
  const yearBig = floorDiv(dayIndex, BigInt(YEAR_DAYS));
  const doy = Number(dayIndex - yearBig * BigInt(YEAR_DAYS));
  const m = moonOfDay(doy);
  let rest = moonNs - dayIndex * MOON_DAY_NS;
  const nanosecond = Number(rest % NS_PER_SECOND);
  rest /= NS_PER_SECOND;
  return {
    cycle: Number(yearBig),
    year: Number(yearBig),
    moon: m + 1,
    day: doy - firstDayOfMoon(m) + 1,
    dayOfYear: doy + 1,
    dayOfCycle: doy + 1,
    hour: Number(rest / 3600n),
    minute: Number((rest / 60n) % 60n),
    second: Number(rest % 60n),
    nanosecond,
    moonNs,
  };
}

export const toMoon = (unixNs: bigint): MoonTime => fromMoonNs(unixNsToMoonNs(unixNs));

export interface MoonInput {
  /** Moon's year. `year` is accepted as the same thing. */
  cycle?: number;
  year?: number;
  moon: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  nanosecond?: number;
}

export class MoonRangeError extends Error {}

export function moonNsOf(t: MoonInput): bigint {
  const { moon, day, hour = 0, minute = 0, second = 0, nanosecond = 0 } = t;
  const year = (t.cycle ?? t.year) as number;
  const ints: [string, number][] = [['cycle', year], ['moon', moon], ['day', day], ['hour', hour], ['minute', minute], ['second', second], ['nanosecond', nanosecond]];
  for (const [k, v] of ints) if (!Number.isInteger(v)) throw new MoonRangeError(`${k} must be an integer`);
  if (moon < 1 || moon > MOONS) throw new MoonRangeError('moon must be 1 to 13');
  const len = moonLength(moon);
  if (day < 1 || day > len) throw new MoonRangeError(`day must be 1 to ${len} in moon ${moon}`);
  if (hour < 0 || hour > 23) throw new MoonRangeError('hour must be 0 to 23');
  if (minute < 0 || minute > 59) throw new MoonRangeError('minute must be 0 to 59');
  if (second < 0 || second > 59) throw new MoonRangeError('second must be 0 to 59');
  if (nanosecond < 0 || nanosecond > 999_999_999) throw new MoonRangeError('nanosecond must be 0 to 999999999');
  const dayIndex = BigInt(year) * BigInt(YEAR_DAYS) + BigInt(firstDayOfMoon(moon - 1) + day - 1);
  const secs = BigInt(hour * 3600 + minute * 60 + second);
  return dayIndex * MOON_DAY_NS + secs * NS_PER_SECOND + BigInt(nanosecond);
}

export const toUnixNs = (t: MoonInput): bigint => moonNsToUnixNs(moonNsOf(t));

const p = (n: number, w = 2) => String(n).padStart(w, '0');

/** A Moonmark: "YEAR.MM.DD HH:MM:SS.NNNNNNNNN", one exact moment on the Moon engine. */
export const formatMoonmark = (t: MoonTime, digits = 9): string =>
  `${t.year}.${p(t.moon)}.${p(t.day)} ${p(t.hour)}:${p(t.minute)}:${p(t.second)}` +
  (digits > 0 ? '.' + p(t.nanosecond, 9).slice(0, digits) : '');

/** Parse a Moonmark: "YEAR.MM.DD" plus optional "HH:MM:SS(.fraction)". Also accepts the URL form "YEAR.MM.DD-HH.MM.SS.fraction". */
export function parseMoonmark(s: string): MoonInput {
  const url = /^(-?\d+\.\d{1,2}\.\d{1,2})-(\d{1,2})\.(\d{2})(?:\.(\d{2})(?:\.(\d{1,9}))?)?$/.exec(s.trim());
  if (url) s = `${url[1]} ${url[2]}:${url[3]}${url[4] ? ':' + url[4] : ''}${url[5] ? '.' + url[5] : ''}`;
  const m = /^(-?\d+)\.(\d{1,2})\.(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/.exec(s.trim());
  if (!m) throw new MoonRangeError('a Moonmark is YEAR.MM.DD HH:MM:SS.fraction');
  return {
    year: +m[1], moon: +m[2], day: +m[3],
    hour: m[4] ? +m[4] : 0, minute: m[5] ? +m[5] : 0, second: m[6] ? +m[6] : 0,
    nanosecond: m[7] ? +m[7].padEnd(9, '0') : 0,
  };
}

/** Position in the MEAN lunation (Moon's month boundaries). For what the sky shows, use truePhase. */
export function phase(moonNs: bigint): number {
  const moonLenNs = (BigInt(YEAR_DAYS) * MOON_DAY_NS) / BigInt(MOONS); // 28.3846… Moon days
  const r = ((moonNs % moonLenNs) + moonLenNs) % moonLenNs;
  return Number(r) / Number(moonLenNs);
}


const RAD = Math.PI / 180;
const sinD = (d: number) => Math.sin(d * RAD);
const norm360 = (d: number) => ((d % 360) + 360) % 360;

/**
 * Elongation of the real Moon from the Sun, degrees (0 = new, 180 = full).
 * Principal periodic terms from Meeus, Astronomical Algorithms ch. 47-49;
 * quarter phases land within about 15 minutes of published times.
 */
export function elongation(unixNs: bigint): number {
  const ms = Number(unixNs / 1_000_000n);
  const T = (ms / 86_400_000 + 2440587.5 - 2451545.0) / 36525;
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T ** 3 / 545868);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T ** 3 / 69699);
  const F = norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const moon =
    6.288774 * sinD(Mp) + 1.274027 * sinD(2 * D - Mp) + 0.658314 * sinD(2 * D) +
    0.213618 * sinD(2 * Mp) - 0.185116 * E * sinD(M) - 0.114332 * sinD(2 * F) +
    0.058793 * sinD(2 * D - 2 * Mp) + 0.057066 * E * sinD(2 * D - M - Mp) +
    0.053322 * sinD(2 * D + Mp) + 0.045758 * E * sinD(2 * D - M) -
    0.040923 * E * sinD(M - Mp) - 0.03472 * sinD(D) - 0.030383 * E * sinD(M + Mp) +
    0.015327 * sinD(2 * D - 2 * F) - 0.012528 * sinD(Mp + 2 * F) + 0.01098 * sinD(Mp - 2 * F) +
    0.010675 * sinD(4 * D - Mp) + 0.010034 * sinD(3 * Mp) + 0.008548 * sinD(4 * D - 2 * Mp);
  const sun = (1.914602 - 0.004817 * T) * sinD(M) + 0.019993 * sinD(2 * M) + 0.000289 * sinD(3 * M);
  return norm360(D + moon - sun);
}

/** The real moon's phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
export const truePhase = (unixNs: bigint): number => elongation(unixNs) / 360;
/** Fraction of the Moon's disc that is lit, 0..1. */
// Lit fraction from the true phase angle: Moon latitude and the Earth-Moon and
// Earth-Sun distances (Meeus ch. 47-48). Matches PyEphem within 0.05 points.
export function illumination(unixNs: bigint): number {
  const cosD = (d: number) => Math.cos(d * RAD);
  const ms = Number(unixNs / 1_000_000n);
  const T = (ms / 86_400_000 + 2440587.5 - 2451545.0) / 36525;
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T ** 3 / 545868);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T ** 3 / 69699);
  const F = norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const beta = 5.128122 * sinD(F) + 0.280602 * sinD(Mp + F) + 0.277693 * sinD(Mp - F) + 0.173237 * sinD(2 * D - F) +
    0.055413 * sinD(2 * D - Mp + F) + 0.046271 * sinD(2 * D - Mp - F) + 0.032573 * sinD(2 * D + F) + 0.017198 * sinD(2 * Mp + F);
  const dist = 385000.56 - 20905.355 * cosD(Mp) - 3699.111 * cosD(2 * D - Mp) - 2955.968 * cosD(2 * D) - 569.925 * cosD(2 * Mp) +
    48.888 * E * cosD(M) - 3.149 * cosD(2 * F) + 246.158 * cosD(2 * D - 2 * Mp) - 152.138 * E * cosD(2 * D - M - Mp) -
    170.733 * cosD(2 * D + Mp) - 204.586 * E * cosD(2 * D - M) - 129.62 * E * cosD(M - Mp) + 108.743 * cosD(D) + 104.755 * E * cosD(M + Mp);
  const R = 149597870.7 * (1.00014 - 0.016708 * cosD(M) - 0.000141 * cosD(2 * M));
  const psi = Math.acos(Math.max(-1, Math.min(1, cosD(beta) * cosD(elongation(unixNs)))));
  const i = Math.atan2(R * Math.sin(psi), dist - R * Math.cos(psi));
  return (1 + Math.cos(i)) / 2;
}

export const PHASE_NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
export const phaseName = (f: number): string => PHASE_NAMES[Math.floor((f * 8 + 0.5) % 8)];

export const unixNsToIso = (ns: bigint): string => {
  const ms = floorDiv(ns, 1_000_000n);
  const sub = Number(ns - ms * 1_000_000n);
  const iso = new Date(Number(ms)).toISOString(); // ...sss Z
  return iso.slice(0, -1) + String(sub).padStart(6, '0') + 'Z';
};

/** Structure of one cycle (Moon's year): each moon's length and UTC start. */
export function yearInfo(year: number) {
  if (!Number.isInteger(year)) throw new MoonRangeError('cycle must be an integer');
  const moons = [];
  for (let m = 1; m <= MOONS; m++) {
    const startNs = toUnixNs({ year, moon: m, day: 1 });
    moons.push({ moon: m, days: moonLength(m), starts_unix_ns: startNs.toString(), starts_utc: unixNsToIso(startNs) });
  }
  const endNs = toUnixNs({ year: year + 1, moon: 1, day: 1 });
  return { cycle: year, year, days: YEAR_DAYS, moons, ends_unix_ns: endNs.toString(), ends_utc: unixNsToIso(endNs) };
}

/** URL-safe Moonmark, for links and QR codes: "YEAR.MM.DD-HH.MM.SS.NNNNNNNNN". */
export const moonmarkPath = (mm: string): string => mm.replace(' ', '-').replace(/:/g, '.');

/** Earlier names, kept so existing code keeps working. */
export const formatStamp = formatMoonmark;
export const parseStamp = parseMoonmark;
