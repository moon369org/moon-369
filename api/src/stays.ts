/**
 * Moon Stays: guest passes for short-term rentals, built so the lock trusts a signature instead of the internet.
 *
 * - A host registers a door and gets a key (Moon keeps only its SHA-256) and a PIN secret the lock also holds.
 * - Each booking gets a single-use invite. The guest's phone makes its own P-256 key; Moon signs a stay pass with
 *   its Ed25519 key over the door, the stay, the phone's public key and a time window (at most renew_hours long,
 *   renewed while the phone is online, so a cancelled stay stops working within a day).
 * - The phone shows a QR that changes every 30 seconds: the pass, the 30-second window and the phone's signature.
 *   The lock checks all of it offline with Moon's public key and its own clock.
 * - Each stay also gets a backup PIN the lock can check offline: arrival day, nights, and an HMAC with the PIN secret.
 * - The lock logs every opening and sends the log when it is online; Moon signs each one as a visit.
 *
 *   stay:door:<id>          -> door JSON
 *   stay:door:<id>:s        -> hash stay id -> stay JSON
 *   stay:door:<id>:inv      -> hash invite token -> stay id
 *   stay:door:<id>:log      -> list of visit JSON, newest first (capped)
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { sha256hex, isId, cleanName, p256, newId } from './tickets.js';
import { verify as cverify } from 'node:crypto';

export interface StayDoor { id: string; name: string; owner: string; pin_secret: string; tz: string; checkin_hour: number; checkout_hour: number; renew_hours: number; created: string }
export interface Stay {
  id: string; door: string; guest: string | null; arrive: string; depart: string; check_in: string; check_out: string;
  invite: string | null; pub: string | null; key_sha256: string | null; created: string; joined: string | null; cancelled: string | null;
}
export interface StayVisit { stay: string; method: 'qr' | 'pin'; at: string; logged: string; moonmark: string | null; signed_url: string | null }
export interface StayStore {
  putDoor(d: StayDoor): Promise<boolean>;
  getDoor(id: string): Promise<StayDoor | null>;
  putStay(s: Stay): Promise<void>;
  getStay(door: string, id: string): Promise<Stay | null>;
  stays(door: string): Promise<Stay[]>;
  addInvite(door: string, token: string, stay: string): Promise<void>;
  takeInvite(door: string, token: string): Promise<string | null>;
  log(door: string, v: StayVisit[]): Promise<void>;
  visits(door: string, n?: number): Promise<StayVisit[]>;
}

export const CODE_MS = 30_000;          // the stay QR changes every 30 seconds
export const CODE_SLACK = 1;            // the lock takes the current window and one either side
export const PIN_EPOCH_DAY = Date.UTC(2026, 0, 1) / 86_400_000;
export const MAX_STAYS = 5000;

/** What Moon signs for a stay pass, and what a lock checks offline. Times in Unix seconds. */
export const passBytes = (door: string, stay: string, pub: string, nb: number, na: number) =>
  Buffer.from(['moon-stay-pass/1', door, stay, pub, String(nb), String(na)].join('\n'));
/** What the guest's phone signs for each 30-second code. */
export const stayCodeMessage = (door: string, stay: string, w: number) => `moon-stay-code/1|${door}|${stay}|${w}`;
/** What Moon signs when a lock reports an opening. */
export const visitStatement = (door: string, stay: string, method: string, at: string) => ['moon-stay-visit/1', 'door:' + door, 'stay:' + stay, 'method:' + method, 'at:' + at].join('\n');

/** Milliseconds between UTC and the wall clock of a time zone at instant t. */
export function tzOffsetMs(tz: string, t: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}
/** The instant a wall-clock time happens in a time zone. */
export function zoned(tz: string, y: number, m: number, d: number, h: number): number {
  const guess = Date.UTC(y, m - 1, d, h);
  let t = guess - tzOffsetMs(tz, guess);
  t = guess - tzOffsetMs(tz, t);
  return t;
}
export const validTz = (tz: unknown): tz is string => { if (typeof tz !== 'string' || tz.length > 64) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
const ymd = (s: string) => s.split('-').map(Number) as [number, number, number];
export const dayNumber = (date: string) => { const [y, m, d] = ymd(date); return Date.UTC(y, m - 1, d) / 86_400_000 - PIN_EPOCH_DAY; };

/** The backup PIN for a stay: 3 digits of arrival day, 2 of nights, 5 of HMAC. The lock rebuilds it offline. */
export function stayPin(secret: string, door: string, arrive: string, nights: number): string {
  const day = ((dayNumber(arrive) % 1000) + 1000) % 1000;
  const mac = createHmac('sha256', Buffer.from(secret, 'base64url')).update(`moon-stay-pin/1|${door}|${dayNumber(arrive)}|${nights}`).digest().readUInt32BE(0) % 100000;
  return String(day).padStart(3, '0') + String(nights).padStart(2, '0') + String(mac).padStart(5, '0');
}

export function stayWindow(d: StayDoor, s: Stay) { return { nb: Math.floor(Date.parse(s.check_in) / 1000), na: Math.floor(Date.parse(s.check_out) / 1000) }; }
/** The next pass for a stay: from now (or check-in, if that's later) for renew_hours, never past check-out. */
export function passWindow(d: StayDoor, s: Stay, nowMs: number): { nb: number; na: number } {
  const w = stayWindow(d, s), now = Math.floor(nowMs / 1000);
  const nb = Math.max(w.nb, Math.min(now, w.na));
  const na = d.renew_hours > 0 ? Math.min(w.na, Math.max(nb, now) + d.renew_hours * 3600) : w.na;
  return { nb, na };
}

export function checkStayCode(s: Stay, w: unknown, sig: unknown, nowMs: number, maxAgeWindows = CODE_SLACK): boolean {
  if (!s.pub || !Number.isInteger(w) || typeof sig !== 'string' || !/^[A-Za-z0-9_-]{60,100}$/.test(sig)) return false;
  const cur = Math.floor(nowMs / CODE_MS), age = cur - (w as number);
  if (age < -CODE_SLACK || age > maxAgeWindows) return false;
  const key = p256(s.pub); if (!key) return false;
  const b = Buffer.from(sig, 'base64url'); if (b.length !== 64) return false;
  return cverify('sha256', Buffer.from(stayCodeMessage(s.door, s.id, w as number)), { key, dsaEncoding: 'ieee-p1363' }, b);
}

export const ownerOk = (d: StayDoor, key: unknown) => typeof key === 'string' && key.length >= 16 && key.length <= 64 && sha256hex(key) === d.owner;
export const newSecret = () => randomBytes(32).toString('base64url');
export { isId, cleanName, newId, sha256hex, createHash };

export function memoryStays(): StayStore {
  const doors = new Map<string, StayDoor>(), stays = new Map<string, Map<string, Stay>>(), invs = new Map<string, string>(), logs = new Map<string, StayVisit[]>();
  const S = (d: string) => { if (!stays.has(d)) stays.set(d, new Map()); return stays.get(d)!; };
  return {
    async putDoor(d) { if (doors.has(d.id)) return false; doors.set(d.id, d); return true; },
    async getDoor(id) { return doors.get(id) ?? null; },
    async putStay(s) { S(s.door).set(s.id, s); },
    async getStay(d, id) { return S(d).get(id) ?? null; },
    async stays(d) { return [...S(d).values()]; },
    async addInvite(d, t, s) { invs.set(d + ':' + t, s); },
    async takeInvite(d, t) { const k = d + ':' + t, s = invs.get(k) ?? null; invs.delete(k); return s; },
    async log(d, v) { logs.set(d, [...v.slice().reverse(), ...(logs.get(d) ?? [])].slice(0, 2000)); },
    async visits(d, n = 200) { return (logs.get(d) ?? []).slice(0, n); },
  };
}

export function upstashStays(url: string, token: string): StayStore {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!r.ok) throw new Error('stays ' + r.status);
    const j = (await r.json()) as { result?: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  const K = (d: string) => `stay:door:${d}`;
  return {
    async putDoor(d) { return (await call(['SET', K(d.id), JSON.stringify(d), 'NX'])) === 'OK'; },
    async getDoor(id) { const r = (await call(['GET', K(id)])) as string | null; return r ? (JSON.parse(r) as StayDoor) : null; },
    async putStay(s) { await call(['HSET', K(s.door) + ':s', s.id, JSON.stringify(s)]); },
    async getStay(d, id) { const r = (await call(['HGET', K(d) + ':s', id])) as string | null; return r ? (JSON.parse(r) as Stay) : null; },
    async stays(d) { const a = ((await call(['HGETALL', K(d) + ':s'])) as string[]) || []; const out: Stay[] = []; for (let i = 1; i < a.length; i += 2) out.push(JSON.parse(a[i]) as Stay); return out; },
    async addInvite(d, t, s) { await call(['HSET', K(d) + ':inv', t, s]); },
    async takeInvite(d, t) {
      const s = (await call(['HGET', K(d) + ':inv', t])) as string | null;
      if (!s) return null;
      return Number(await call(['HDEL', K(d) + ':inv', t])) === 1 ? s : null;   // only one phone wins
    },
    async log(d, v) { if (!v.length) return; await call(['LPUSH', K(d) + ':log', ...v.map((x) => JSON.stringify(x))]); await call(['LTRIM', K(d) + ':log', 0, 1999]); },
    async visits(d, n = 200) { return (((await call(['LRANGE', K(d) + ':log', 0, n - 1])) as string[]) || []).map((x) => JSON.parse(x) as StayVisit); },
  };
}
