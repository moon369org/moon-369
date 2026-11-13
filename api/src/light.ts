/**
 * Light and Dark: how people live the day on Moon.
 * The Light counter starts at 00:00:00 at first light (sunrise) and runs until sunset.
 * The Dark counter starts at 00:00:00 at sunset and runs until the next first light.
 * Counters tick in Moon seconds. Nothing here needs a time zone: only where you stand.
 * The Moon date is global and never depends on first light; Light and Dark only count the local day.
 * Polar fallback: when the sun neither rises nor sets, the day starts at solar midnight
 * and the whole day is Light (midnight sun) or Dark (polar night).
 */
import { toMoon, MOON_SECOND_SI as SI_PER_MOON } from './moon.js';
import { sunDay, checkLatLon } from './sun.js';

const DAY_MS = 86_400_000;
type Edge = { kind: 'first_light' | 'sunset' | 'polar_day_start' | 'polar_night_start'; ms: number };

function utcDate(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Every first light and sunset (or polar day start) around an instant, in order. */
function edges(ms: number, lat: number, lon: number): Edge[] {
  const out: Edge[] = [];
  for (let k = -2; k <= 2; k++) {
    const d = sunDay(utcDate(ms + k * DAY_MS), lat, lon);
    const noon = Number(d.solar_noon / 1_000_000n);
    if (d.polar === 'day') out.push({ kind: 'polar_day_start', ms: noon - DAY_MS / 2 });
    else if (d.polar === 'night') out.push({ kind: 'polar_night_start', ms: noon - DAY_MS / 2 });
    else { out.push({ kind: 'first_light', ms: Number(d.sunrise! / 1_000_000n) }); out.push({ kind: 'sunset', ms: Number(d.sunset! / 1_000_000n) }); }
  }
  out.sort((a, b) => a.ms - b.ms);
  return out.filter((e, i) => i === 0 || Math.abs(e.ms - out[i - 1].ms) > 60_000);
}

const isDayStart = (e: Edge) => e.kind === 'first_light' || e.kind === 'polar_day_start' || e.kind === 'polar_night_start';
const phaseOf = (e: Edge): 'light' | 'dark' => (e.kind === 'first_light' || e.kind === 'polar_day_start' ? 'light' : 'dark');

/** A duration in standard ms as a Moon-second counter, HH:MM:SS. */
export function counter(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000 / SI_PER_MOON));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
/** Parse a counter like "06:45" or "06:45:30" into standard ms. */
export function counterMs(c: string): number {
  const m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(c.trim());
  if (!m || +m[2] > 59 || (m[3] && +m[3] > 59)) throw new Error('counter must be HH:MM or HH:MM:SS');
  return (+m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0)) * SI_PER_MOON * 1000;
}

export interface LightReading {
  phase: 'light' | 'dark';
  counter: string;            // Moon-second count since the phase began
  label: string;              // "Light 05:19:02"
  began_ms: number;
  ends_ms: number;            // next sunset or first light
  remaining: string;          // counter until the phase ends
  phase_length: string;       // full length of this light or dark, as a counter
  day_start_ms: number;       // this day's first light (or polar start)
  polar: 'day' | 'night' | null;
}

export function lightAt(ms: number, lat: number, lon: number): LightReading {
  checkLatLon(lat, lon);
  const es = edges(ms, lat, lon);
  let i = es.findIndex((e) => e.ms > ms) - 1;
  if (i < 0) i = 0;
  const cur = es[i], nxt = es[i + 1];
  let ds = i; while (ds > 0 && !isDayStart(es[ds])) ds--;
  const phase = phaseOf(cur);
  const polar = cur.kind === 'polar_day_start' ? 'day' : cur.kind === 'polar_night_start' ? 'night' : null;
  const c = counter(ms - cur.ms);
  return {
    phase, counter: c, label: `${phase === 'light' ? 'Light' : 'Dark'} ${c}`,
    began_ms: cur.ms, ends_ms: nxt.ms, remaining: counter(nxt.ms - ms), phase_length: counter(nxt.ms - cur.ms),
    day_start_ms: es[ds].ms, polar,
  };
}

/**
 * The next `days` occurrences of a Light or Dark counter reading at a place,
 * for example Light 06:45 every day. Days where that phase is too short to reach it are skipped.
 */
export function lightSeries(fromMs: number, phase: 'light' | 'dark', c: string, lat: number, lon: number, days: number) {
  checkLatLon(lat, lon);
  const off = counterMs(c);
  const out: { ms: number | null; day_start_ms: number }[] = [];
  let t = lightAt(fromMs, lat, lon).day_start_ms;
  let guard = 0;
  while (out.length < days && guard++ < days * 3 + 10) {
    const es = edges(t + 1, lat, lon);
    const i = es.findIndex((e) => Math.abs(e.ms - t) < 60_000);
    const dayStart = es[i];
    const nextDay = es.slice(i + 1).find(isDayStart)!;
    const phaseStart = phase === 'light'
      ? (phaseOf(dayStart) === 'light' ? dayStart : null)
      : es.slice(i, es.indexOf(nextDay)).find((e) => phaseOf(e) === 'dark') ?? null;
    let ms: number | null = null;
    if (phaseStart) {
      const end = es[es.indexOf(phaseStart) + 1].ms;
      if (phaseStart.ms + off < end) ms = phaseStart.ms + off;
    }
    if (ms === null || ms >= fromMs) out.push({ ms, day_start_ms: dayStart.ms });
    t = nextDay.ms;
  }
  return out;
}
