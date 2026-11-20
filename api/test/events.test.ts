import { describe, it, expect } from 'vitest';
import { handle } from '../src/index.js';
import { memoryEvents, eventId } from '../src/events.js';

const env = () => ({ EVENTS: memoryEvents() });
const call = (e: object, path: string, body?: object) => handle(new Request('https://x' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), e as never);
const j = async (r: Response | Promise<Response>) => { const x = await r; return { s: x.status, b: (await x.json()) as Record<string, any> }; };
const KEY = 'k1_abcdefghijklmnopqrstuv';

describe('events', () => {
  it('only the key holder cancels; anyone with the id sees it', async () => {
    const e = env(), id = eventId(KEY);
    expect((await j(call(e, `/v1/events/${id}`))).b).toMatchObject({ id, cancelled: false });
    const c = await j(call(e, '/v1/events/cancel', { key: KEY }));
    expect(c.s).toBe(200); expect(c.b).toMatchObject({ id, cancelled: true });
    const g = await j(call(e, `/v1/events/${id}`));
    expect(g.b.cancelled).toBe(true); expect(g.b.cancelled_at).toBe(c.b.cancelled_at);
    const again = await j(call(e, '/v1/events/cancel', { key: KEY }));
    expect(again.b.cancelled_at).toBe(c.b.cancelled_at);   // the first cancellation stands
  });
  it('rejects bad keys and ids', async () => {
    const e = env();
    expect((await j(call(e, '/v1/events/cancel', { key: 'short' }))).s).toBe(400);
    expect((await j(call(e, '/v1/events/nothex'))).s).toBe(400);
    expect((await call(e, '/v1/events/cancel')).status).toBe(405);
  });
});
