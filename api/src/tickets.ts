/**
 * Moon tickets: a guest's ticket is a Moonmark, and it only works on the phone it was issued to.
 *
 * - An organizer registers a ticketed event and gets a door key (only its SHA-256 is stored).
 * - A guest's phone makes its own P-256 key pair and keeps the private half where it can't be copied out.
 *   Moon signs a moon-ticket/1 statement that names the event, the ticket and the fingerprint of that public key.
 * - At the door the phone shows a QR that changes every few seconds: the ticket, the current 5-second window and
 *   the phone's signature over both. A screenshot is stale within seconds, and no other phone can make the next code.
 * - The door checks the code and checks the guest in once. Moon signs the check-in as its own Moonmark.
 *
 *   tkt:ev:<event>          -> event JSON (written once)
 *   tkt:ev:<event>:t        -> hash ticket id -> ticket JSON
 *   tkt:ev:<event>:in       -> hash ticket id -> check-in JSON (first write wins; for a pass, the last visit)
 *   tkt:ev:<place>:inv      -> hash invite token -> invite JSON (a pass's single-use invitations)
 *   tkt:ev:<place>:v        -> hash pass id -> number of visits
 */
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify as cverify } from 'node:crypto';

/** kind 'pass': a place with members (a gym, a club). Passes are used again and again; passback_min stops one pass
 *  letting a second person in right after the first. */
export interface TicketEvent { id: string; name: string; moonmark: string | null; start_utc: string | null; door: string; created: string; max: number; kind?: 'event' | 'pass'; passback_min?: number }
export interface Ticket { id: string; event: string; pub: string; key_sha256: string; name: string | null; moonmark: string; signed_url: string | null; created: string; expires?: string | null; revoked?: string | null }
/** A single-use invitation to become a member: whoever opens it first binds the pass to their phone. */
export interface Invite { token: string; name: string | null; days: number | null; created: string }
export interface CheckIn { at: string; moonmark: string | null; signed_url: string | null }

export interface TicketStore {
  putEvent(ev: TicketEvent): Promise<boolean>;
  getEvent(id: string): Promise<TicketEvent | null>;
  addTicket(t: Ticket): Promise<number>;            // returns how many tickets the event now has
  getTicket(event: string, id: string): Promise<Ticket | null>;
  tickets(event: string): Promise<Ticket[]>;
  count(event: string): Promise<{ tickets: number; in: number }>;
  checkIn(event: string, id: string, c: CheckIn): Promise<{ first: boolean; checkin: CheckIn }>;
  getCheckIn(event: string, id: string): Promise<CheckIn | null>;
  checkIns(event: string): Promise<Record<string, CheckIn>>;
  // passes
  putTicket(t: Ticket): Promise<void>;                              // update a member (renew, cancel)
  addInvite(event: string, inv: Invite): Promise<void>;
  takeInvite(event: string, token: string): Promise<Invite | null>;  // once: the first caller gets it
  invites(event: string): Promise<Invite[]>;
  dropInvite(event: string, token: string): Promise<boolean>;
  visit(event: string, id: string, c: CheckIn): Promise<number>;     // records a visit, returns the member's visit count
  visits(event: string): Promise<Record<string, number>>;
}

export const WINDOW_MS = 5000;          // the QR changes every 5 seconds
export const WINDOW_SLACK = 3;          // codes up to 15 seconds old (or early, for a fast clock) still pass
export const MAX_TICKETS = 5000;

export const newId = (bytes = 9) => randomBytes(bytes).toString('base64url');
export const sha256hex = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const isId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{8,24}$/.test(s);

export function cleanName(s: unknown, max = 80): string {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A raw uncompressed P-256 public key (65 bytes, base64url) as a Node key object, or null. */
export function p256(pubB64: unknown) {
  if (typeof pubB64 !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(pubB64)) return null;
  const raw = Buffer.from(pubB64, 'base64url');
  if (raw.length !== 65 || raw[0] !== 4) return null;
  try { return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' }); }
  catch { return null; }
}

/** What Moon signs when it issues a ticket. */
export const ticketStatement = (ev: TicketEvent, ticketId: string, keySha: string) =>
  ['moon-ticket/1', 'event:' + ev.id, 'name:' + ev.name, 'ticket:' + ticketId, 'key:' + keySha].join('\n');
/** What Moon signs when a guest is checked in. */
export const checkInStatement = (eventId: string, ticketId: string) => ['moon-checkin/1', 'event:' + eventId, 'ticket:' + ticketId].join('\n');
/** What Moon signs when it issues a member's pass, and at each visit. */
export const passStatement = (ev: TicketEvent, id: string, keySha: string, expires: string | null) =>
  ['moon-pass/1', 'place:' + ev.id, 'name:' + ev.name, 'pass:' + id, 'key:' + keySha, 'expires:' + (expires ?? 'never')].join('\n');
export const visitStatement = (placeId: string, passId: string, n: number) => ['moon-visit/1', 'place:' + placeId, 'pass:' + passId, 'visit:' + n].join('\n');
export const MAX_MEMBERS = 20_000;
/** What the guest's phone signs for each code it shows. */
export const codeMessage = (eventId: string, ticketId: string, w: number) => `moon-ticket-code/1|${eventId}|${ticketId}|${w}`;

/** Check one door code: the guest's phone signed this ticket for this 5-second window, and the window is current.
 *  A door that had no signal sends its check-ins later with late: their codes may then be up to a day old. */
export const LATE_WINDOWS = 17_280;   // a day of 5-second windows
export function checkCode(t: Ticket, w: unknown, sigB64: unknown, nowMs: number, late = false): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(w)) return { ok: false, reason: 'bad_code' };
  const cur = Math.floor(nowMs / WINDOW_MS);
  const age = cur - (w as number);
  if (late ? age < -WINDOW_SLACK || age > LATE_WINDOWS : Math.abs(age) > WINDOW_SLACK) return { ok: false, reason: 'stale_code' };
  if (typeof sigB64 !== 'string' || !/^[A-Za-z0-9_-]{60,100}$/.test(sigB64)) return { ok: false, reason: 'bad_code' };
  const key = p256(t.pub); if (!key) return { ok: false, reason: 'bad_ticket' };
  const sig = Buffer.from(sigB64, 'base64url');
  if (sig.length !== 64) return { ok: false, reason: 'bad_code' };
  const good = cverify('sha256', Buffer.from(codeMessage(t.event, t.id, w as number)), { key, dsaEncoding: 'ieee-p1363' }, sig);
  return good ? { ok: true } : { ok: false, reason: 'wrong_phone' };
}

/** The organizer's door key, compared in constant time against the stored fingerprint. */
export function doorOk(ev: TicketEvent, key: unknown): boolean {
  if (typeof key !== 'string' || key.length < 16 || key.length > 64) return false;
  const a = Buffer.from(sha256hex(key), 'hex'), b = Buffer.from(ev.door, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function memoryTickets(): TicketStore {
  const evs = new Map<string, TicketEvent>(), tks = new Map<string, Map<string, Ticket>>(), ins = new Map<string, Map<string, CheckIn>>();
  const T = (e: string) => { if (!tks.has(e)) tks.set(e, new Map()); return tks.get(e)!; };
  const I = (e: string) => { if (!ins.has(e)) ins.set(e, new Map()); return ins.get(e)!; };
  const invs = new Map<string, Map<string, Invite>>(), vis = new Map<string, Map<string, number>>();
  const V = (e: string) => { if (!invs.has(e)) invs.set(e, new Map()); return invs.get(e)!; };
  const N = (e: string) => { if (!vis.has(e)) vis.set(e, new Map()); return vis.get(e)!; };
  return {
    async putTicket(t) { T(t.event).set(t.id, t); },
    async addInvite(e, inv) { V(e).set(inv.token, inv); },
    async takeInvite(e, tok) { const i = V(e).get(tok) ?? null; if (i) V(e).delete(tok); return i; },
    async invites(e) { return [...V(e).values()]; },
    async dropInvite(e, tok) { return V(e).delete(tok); },
    async visit(e, id, c) { I(e).set(id, c); const n = (N(e).get(id) ?? 0) + 1; N(e).set(id, n); return n; },
    async visits(e) { return Object.fromEntries(N(e)); },
    async putEvent(ev) { if (evs.has(ev.id)) return false; evs.set(ev.id, ev); return true; },
    async getEvent(id) { return evs.get(id) ?? null; },
    async addTicket(t) { T(t.event).set(t.id, t); return T(t.event).size; },
    async getTicket(e, id) { return T(e).get(id) ?? null; },
    async tickets(e) { return [...T(e).values()]; },
    async count(e) { return { tickets: T(e).size, in: I(e).size }; },
    async checkIn(e, id, c) { const m = I(e); if (m.has(id)) return { first: false, checkin: m.get(id)! }; m.set(id, c); return { first: true, checkin: c }; },
    async getCheckIn(e, id) { return I(e).get(id) ?? null; },
    async checkIns(e) { return Object.fromEntries(I(e)); },
  };
}

export function upstashTickets(url: string, token: string): TicketStore {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!r.ok) throw new Error('tickets ' + r.status);
    const j = (await r.json()) as { result?: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  const K = (e: string) => `tkt:ev:${e}`;
  const hashAll = <V>(r: unknown): Record<string, V> => {
    const out: Record<string, V> = {}; const a = (r as string[]) || [];
    for (let i = 0; i + 1 < a.length; i += 2) out[a[i]] = JSON.parse(a[i + 1]) as V;
    return out;
  };
  return {
    async putTicket(t) { await call(['HSET', K(t.event) + ':t', t.id, JSON.stringify(t)]); },
    async addInvite(e, inv) { await call(['HSET', K(e) + ':inv', inv.token, JSON.stringify(inv)]); },
    async takeInvite(e, tok) {
      const r = (await call(['HGET', K(e) + ':inv', tok])) as string | null;
      if (!r) return null;
      return Number(await call(['HDEL', K(e) + ':inv', tok])) === 1 ? (JSON.parse(r) as Invite) : null;   // only one phone wins
    },
    async invites(e) { return Object.values(hashAll<Invite>(await call(['HGETALL', K(e) + ':inv']))); },
    async dropInvite(e, tok) { return Number(await call(['HDEL', K(e) + ':inv', tok])) === 1; },
    async visit(e, id, c) { await call(['HSET', K(e) + ':in', id, JSON.stringify(c)]); return Number(await call(['HINCRBY', K(e) + ':v', id, 1])); },
    async visits(e) { const a = ((await call(['HGETALL', K(e) + ':v'])) as string[]) || []; const o: Record<string, number> = {}; for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = Number(a[i + 1]); return o; },
    async putEvent(ev) { return (await call(['SET', K(ev.id), JSON.stringify(ev), 'NX'])) === 'OK'; },
    async getEvent(id) { const r = (await call(['GET', K(id)])) as string | null; return r ? (JSON.parse(r) as TicketEvent) : null; },
    async addTicket(t) { await call(['HSET', K(t.event) + ':t', t.id, JSON.stringify(t)]); return Number(await call(['HLEN', K(t.event) + ':t'])); },
    async getTicket(e, id) { const r = (await call(['HGET', K(e) + ':t', id])) as string | null; return r ? (JSON.parse(r) as Ticket) : null; },
    async tickets(e) { return Object.values(hashAll<Ticket>(await call(['HGETALL', K(e) + ':t']))); },
    async count(e) { return { tickets: Number(await call(['HLEN', K(e) + ':t'])), in: Number(await call(['HLEN', K(e) + ':in'])) }; },
    async checkIn(e, id, c) {
      const first = Number(await call(['HSETNX', K(e) + ':in', id, JSON.stringify(c)])) === 1;
      if (first) return { first, checkin: c };
      const r = (await call(['HGET', K(e) + ':in', id])) as string;
      return { first, checkin: JSON.parse(r) as CheckIn };
    },
    async getCheckIn(e, id) { const r = (await call(['HGET', K(e) + ':in', id])) as string | null; return r ? (JSON.parse(r) as CheckIn) : null; },
    async checkIns(e) { return hashAll<CheckIn>(await call(['HGETALL', K(e) + ':in'])); },
  };
}
