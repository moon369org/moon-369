// Event cancellation. A Moon event is a link, so nothing on Moon holds it; to let its maker call it off,
// the app makes a cancel key when it creates the event and puts only the key's id in the link (c=).
// Whoever holds the key can cancel; anyone with the link can see that it was cancelled.
import { createHash } from 'node:crypto';

export interface EventCancel { id: string; cancelled_at: string }
export interface EventStore {
  cancel(c: EventCancel): Promise<EventCancel>;     // idempotent: keeps the first cancellation
  get(id: string): Promise<EventCancel | null>;
}

/** The public id of a cancel key: 32 hex characters. */
export const eventId = (key: string) => createHash('sha256').update('moon-event/1|' + key).digest('hex').slice(0, 32);
export const isEventKey = (k: unknown): k is string => typeof k === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(k);
export const isEventId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{32}$/.test(id);

export function memoryEvents(): EventStore {
  const m = new Map<string, EventCancel>();
  return {
    async cancel(c) { if (!m.has(c.id)) m.set(c.id, c); return m.get(c.id)!; },
    async get(id) { return m.get(id) ?? null; },
  };
}

export function upstashEvents(url: string, token: string): EventStore {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!r.ok) throw new Error('events ' + r.status);
    const j = (await r.json()) as { result?: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  const K = (id: string) => `event:cancel:${id}`;
  const get = async (id: string) => { const r = (await call(['GET', K(id)])) as string | null; return r ? (JSON.parse(r) as EventCancel) : null; };
  return {
    async cancel(c) { await call(['SET', K(c.id), JSON.stringify(c), 'NX']); return (await get(c.id)) ?? c; },
    get,
  };
}
