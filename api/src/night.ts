// "Your Moon": the moon on any day in history, as a share card.
// /v1/night.png?d=1990-06-14&t=2130&z=-0700&for=born&fmt=og|story
// d is the local date, t the optional local time (HHMM), z the UTC offset (+HHMM). Without a time,
// local noon is used. The occasion is one of a fixed list, never free text, so nobody can put
// their own words on an image served from Moon.
import { moonSvg } from './card.js';
import { toMoon, truePhase, illumination, moonLength, formatMoonmark } from './moon.js';
/** A bad query parameter; the API turns it into a 400. */
export class NightParamError extends Error {}

const INK = '#0B0B0D', PAPER = '#E9E4D8', ASH = '#8A8B8F', LINE = '#24262A', SOFT = '#B9B6AE';
const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

export const OCCASIONS: Record<string, string> = {
  day: 'THE MOON ON',
  born: 'THE MOON WHEN I WAS BORN',
  met: 'THE MOON WHEN WE MET',
  wed: 'THE MOON ON OUR WEDDING DAY',
  kid: 'THE MOON WHEN MY CHILD WAS BORN',
};

export interface NightInput { y: number; mo: number; d: number; h: number | null; mi: number; z: number; occasion: string }

export function parseNight(q: URLSearchParams): NightInput {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.get('d') ?? '');
  if (!dm) throw new NightParamError('d must be a date like 1990-06-14');
  const [y, mo, d] = [+dm[1], +dm[2], +dm[3]];
  const probe = new Date(Date.UTC(2000, mo - 1, d));
  if (y < 1000 || y > 2999 || mo < 1 || mo > 12 || probe.getUTCMonth() !== mo - 1 || (mo === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))))
    throw new NightParamError('d must be a real date between the years 1000 and 2999');
  let h: number | null = null, mi = 0;
  const tq = q.get('t');
  if (tq) {
    const tm = /^(\d{2}):?(\d{2})$/.exec(tq);
    if (!tm || +tm[1] > 23 || +tm[2] > 59) throw new NightParamError('t must be a time like 2130');
    h = +tm[1]; mi = +tm[2];
  }
  let z = 0;
  const zq = q.get('z');
  if (zq) {
    const zm = /^([+-])(\d{2}):?(\d{2})$/.exec(zq.replace(' ', '+'));
    if (!zm || +zm[2] > 14 || +zm[3] > 59) throw new NightParamError('z must be a UTC offset like -0700');
    z = (zm[1] === '-' ? -1 : 1) * (+zm[2] * 60 + +zm[3]);
  }
  const occasion = OCCASIONS[q.get('for') ?? ''] ? q.get('for')! : 'day';
  return { y, mo, d, h, mi, z, occasion };
}

/** The moment, in Unix ms. A date with no time means local noon. */
export function nightMs(n: Pick<NightInput, 'y' | 'mo' | 'd' | 'h' | 'mi' | 'z'>): number {
  const dt = new Date(0);
  dt.setUTCFullYear(n.y, n.mo - 1, n.d);
  dt.setUTCHours(n.h ?? 12, n.h === null ? 0 : n.mi, 0, 0);
  return dt.getTime() - n.z * 60_000;
}

/** Phase names with quarters and full and new held to about a day either side, like almanacs. */
export function phaseLabel(f: number): string {
  const near = (x: number) => Math.abs(f - x) < 0.034;
  if (f < 0.034 || f > 0.966) return 'New moon';
  if (near(0.25)) return 'First quarter';
  if (near(0.5)) return 'Full moon';
  if (near(0.75)) return 'Last quarter';
  return (f < 0.5 ? 'Waxing ' : 'Waning ') + (f < 0.25 || f > 0.75 ? 'crescent' : 'gibbous');
}

const SYNODIC_DAYS = 29.530588853;
const ns = (ms: number) => BigInt(Math.round(ms)) * 1_000_000n;
const phaseDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

/** The next year on or after `from` when the moon looks the same on this calendar date (usually 19 years on). */
export function nextReturn(n: NightInput, nowMs: number): number | null {
  const f0 = truePhase(ns(nightMs(n)));
  const start = Math.max(n.y + 1, new Date(nowMs).getUTCFullYear());
  for (let y = start; y < start + 120; y++) {
    if (n.mo === 2 && n.d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) continue;
    if (nightMs({ ...n, y }) <= nowMs) continue;
    if (phaseDiff(truePhase(ns(nightMs({ ...n, y }))), f0) < 0.04) return y;   // within about a day of the same phase
  }
  return null;
}

export function nightFacts(n: NightInput, nowMs: number) {
  const ms = nightMs(n), t = toMoon(ns(ms)), f = truePhase(ns(ms));
  return {
    utc: new Date(ms).toISOString(),
    unix_ms: ms,
    moonmark: formatMoonmark(t, 0),
    cycle: t.year, moon: t.moon, lune: t.day, lunes_in_moon: moonLength(t.moon),
    phase_fraction: f, phase: phaseLabel(f), illumination: illumination(ns(ms)),
    age_days: f * SYNODIC_DAYS,
    returns: nextReturn(n, nowMs),
  };
}

const dateLine = (n: NightInput) => `${n.d} ${MONTHS[n.mo - 1]} ${n.y}`;
/** Syncopate is wide: about 0.92em per character with its letter spacing. */
const fit = (text: string, width: number, max: number) => Math.min(max, Math.floor(width / (text.length * 0.92)));

const LOGO = (x: number, y: number, w: number) => `<svg x="${x}" y="${y}" width="${w}" height="${(w * 120 / 424).toFixed(1)}" viewBox="-10 -10 424 120"><path d="M4,100 V4 L48,64 L92,4 V100" fill="none" stroke="${PAPER}" stroke-width="8" stroke-linejoin="bevel"/><path d="M312,100 V4 L400,96 V0" fill="none" stroke="${PAPER}" stroke-width="8" stroke-linejoin="bevel"/><defs><mask id="nlA" maskUnits="userSpaceOnUse" x="-10" y="-10" width="424" height="120"><rect x="-10" y="-10" width="424" height="120" fill="#fff"/><circle cx="232" cy="50" r="46" fill="none" stroke="#000" stroke-width="18"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#fff" stroke-width="18"/></mask><mask id="nlB" maskUnits="userSpaceOnUse" x="-10" y="-10" width="424" height="120"><rect x="-10" y="-10" width="424" height="120" fill="#fff"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#000" stroke-width="18"/></mask></defs><circle cx="172" cy="50" r="46" fill="none" stroke="${PAPER}" stroke-width="8" mask="url(#nlA)"/><circle cx="232" cy="50" r="46" fill="none" stroke="${PAPER}" stroke-width="8" mask="url(#nlB)"/></svg>`;

function stars(w: number, h: number, count: number, seed: number): string {
  let s = seed >>> 0 || 1, out = '';
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  for (let i = 0; i < count; i++) out += `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h).toFixed(1)}" r="${(0.6 + rnd() * 1.1).toFixed(2)}" fill="${PAPER}" fill-opacity="${(0.08 + rnd() * 0.32).toFixed(2)}"/>`;
  return out;
}

function grid(x: number, y: number, cw: number, k: number, v: number, f: ReturnType<typeof nightFacts>, center = false): string {
  const cells: [string, string][] = [['CYCLE', String(f.cycle)], ['MOON', pad2(f.moon)], ['LUNE', pad2(f.lune)]];
  const rowH = k + v + 34;
  let s = `<path d="M${x} ${y}H${x + cw * 3}M${x} ${y + rowH}H${x + cw * 3}M${x + cw} ${y}V${y + rowH}M${x + 2 * cw} ${y}V${y + rowH}" stroke="${LINE}" stroke-width="2" fill="none"/>`;
  cells.forEach(([a, b], i) => {
    const cx = center ? x + cw * i + cw / 2 : x + cw * i + 22, anchor = center ? ' text-anchor="middle"' : '';
    s += `<text x="${cx}" y="${y + k + 14}" font-family="JetBrains Mono" font-size="${k}" letter-spacing="4" fill="${ASH}"${anchor}>${a}</text>` +
      `<text x="${cx}" y="${y + k + v + 22}" font-family="Syncopate" font-weight="700" font-size="${v}" letter-spacing="1.5" fill="${PAPER}"${anchor}>${b}</text>`;
  });
  return s;
}

export function nightSvg(n: NightInput, f: ReturnType<typeof nightFacts>, fmt: 'og' | 'story'): string {
  const title = OCCASIONS[n.occasion], date = dateLine(n);
  const time = n.h !== null ? `${pad2(n.h)}:${pad2(n.mi)}  ·  ` : '';
  const sub = `${time}${f.phase.toUpperCase()}  ·  ${(f.illumination * 100).toFixed(0)}% LIT`;
  const ret = f.returns ? `THIS MOON RETURNS TO THIS DATE IN ${f.returns}` : '';
  const seed = n.y * 10000 + n.mo * 100 + n.d;
  if (fmt === 'og') {
    const dfs = fit(date, 590, 56);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
      `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PAPER}" stop-opacity="0.10"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient></defs>` +
      `<rect width="1200" height="630" fill="${INK}"/>${stars(1200, 630, 90, seed)}` +
      `<circle cx="300" cy="315" r="270" fill="url(#g)"/>` +
      `<g transform="translate(300,315)">${moonSvg(f.phase_fraction, 165, 'no')}</g>` +
      `<text x="580" y="128" font-family="JetBrains Mono" font-size="19" letter-spacing="5" fill="${ASH}">${title}</text>` +
      `<text x="576" y="202" font-family="Syncopate" font-weight="700" font-size="${dfs}" letter-spacing="2" fill="${PAPER}">${date}</text>` +
      `<text x="580" y="262" font-family="JetBrains Mono" font-size="20" letter-spacing="3" fill="${SOFT}">${sub}</text>` +
      grid(580, 300, 176, 15, 34, f) +
      (ret ? `<text x="580" y="472" font-family="JetBrains Mono" font-size="16" letter-spacing="3" fill="${ASH}">${ret}</text>` : '') +
      LOGO(580, 532, 130) +
      `<text x="1108" y="567" font-family="JetBrains Mono" font-size="17" letter-spacing="3" fill="${ASH}" text-anchor="end">MOON369.ORG/NIGHT</text>` +
      `</svg>`;
  }
  const dfs = fit(date, 900, 68);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">` +
    `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PAPER}" stop-opacity="0.10"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="1080" height="1350" fill="${INK}"/>${stars(1080, 1350, 160, seed)}` +
    LOGO(470, 84, 140) +
    `<text x="540" y="230" font-family="JetBrains Mono" font-size="24" letter-spacing="6" fill="${ASH}" text-anchor="middle">${title}</text>` +
    `<circle cx="540" cy="560" r="330" fill="url(#g)"/>` +
    `<g transform="translate(540,560)">${moonSvg(f.phase_fraction, 210, 'ns')}</g>` +
    `<text x="540" y="912" font-family="Syncopate" font-weight="700" font-size="${dfs}" letter-spacing="2" fill="${PAPER}" text-anchor="middle">${date}</text>` +
    `<text x="540" y="972" font-family="JetBrains Mono" font-size="25" letter-spacing="3" fill="${SOFT}" text-anchor="middle">${sub}</text>` +
    grid(120, 1020, 280, 18, 44, f, true) +
    (ret ? `<text x="540" y="1196" font-family="JetBrains Mono" font-size="20" letter-spacing="3" fill="${ASH}" text-anchor="middle">${ret}</text>` : '') +
    `<text x="540" y="1282" font-family="JetBrains Mono" font-size="22" letter-spacing="4" fill="${ASH}" text-anchor="middle">FIND YOURS AT MOON369.ORG/NIGHT</text>` +
    `</svg>`;
}
