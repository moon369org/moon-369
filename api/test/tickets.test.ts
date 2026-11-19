import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { handle } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { memoryTickets, codeMessage, WINDOW_MS } from '../src/tickets.js';

const { privateKey } = generateKeyPairSync('ed25519');
const env = () => ({ SIGNER: new Signer(privateKey), TICKETS: memoryTickets() });
const call = (e: object, path: string, body?: object) => handle(new Request('https://x' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), e as never);
const j = async (r: Response | Promise<Response>) => (await r).json() as Promise<Record<string, any>>;

// A phone: a P-256 key pair whose private half never leaves it.
async function phone() {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  const code = async (ev: string, t: string, w = Math.floor(Date.now() / WINDOW_MS)) =>
    ({ w, sig: Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.from(codeMessage(ev, t, w)))).toString('base64url') });
  return { pub, code };
}
async function setup() {
  const e = env();
  const made = await j(call(e, '/v1/tickets', { name: 'Launch night' }));
  return { e, ev: made.event.id as string, key: made.door_key as string };
}

describe('tickets', () => {
  it('issues a Moon-signed ticket bound to the phone, and lets the live code in once', async () => {
    const { e, ev, key } = await setup(), p = await phone();
    const iss = await j(call(e, `/v1/tickets/${ev}/issue`, { pub: p.pub, name: 'Ana' }));
    expect(iss.ticket.moonmark).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
    expect(iss.statement).toContain('moon-ticket/1');
    const v = await j(call(e, '/v1/verify', { receipt: iss.receipt }));
    expect(v.valid).toBe(true);
    const c1 = await j(call(e, `/v1/tickets/${ev}/checkin`, { key, ticket: iss.ticket.id, ...(await p.code(ev, iss.ticket.id)) }));
    expect(c1.ok).toBe(true); expect(c1.name).toBe('Ana'); expect(c1.moonmark).toBeTruthy();
    const c2 = await j(call(e, `/v1/tickets/${ev}/checkin`, { key, ticket: iss.ticket.id, ...(await p.code(ev, iss.ticket.id)) }));
    expect(c2.ok).toBe(false); expect(c2.reason).toBe('already_in');
    const st = await j(call(e, `/v1/tickets/${ev}/${iss.ticket.id}`));
    expect(st.checked_in).toBeTruthy(); expect(st.checkin_moonmark).toBeTruthy();
  });
  it('turns away a screenshot: a code more than a few windows old', async () => {
    const { e, ev, key } = await setup(), p = await phone();
    const iss = await j(call(e, `/v1/tickets/${ev}/issue`, { pub: p.pub }));
    const old = await p.code(ev, iss.ticket.id, Math.floor(Date.now() / WINDOW_MS) - 12);   // a minute old
    const r = await j(call(e, `/v1/tickets/${ev}/checkin`, { key, ticket: iss.ticket.id, ...old }));
    expect(r.ok).toBe(false); expect(r.reason).toBe('stale_code');
  });
  it('turns away a code made by any other phone', async () => {
    const { e, ev, key } = await setup(), owner = await phone(), other = await phone();
    const iss = await j(call(e, `/v1/tickets/${ev}/issue`, { pub: owner.pub }));
    const r = await j(call(e, `/v1/tickets/${ev}/checkin`, { key, ticket: iss.ticket.id, ...(await other.code(ev, iss.ticket.id)) }));
    expect(r.ok).toBe(false); expect(r.reason).toBe('wrong_phone');
  });
  it('needs the door key, and keeps only its fingerprint', async () => {
    const { e, ev } = await setup(), p = await phone();
    const iss = await j(call(e, `/v1/tickets/${ev}/issue`, { pub: p.pub }));
    expect((await call(e, `/v1/tickets/${ev}/checkin`, { key: 'x'.repeat(32), ticket: iss.ticket.id, ...(await p.code(ev, iss.ticket.id)) })).status).toBe(403);
    expect((await call(e, `/v1/tickets/${ev}/door`, { key: 'nope-nope-nope-nope' })).status).toBe(403);
    const info = await j(call(e, `/v1/tickets/${ev}`));
    expect(JSON.stringify(info)).not.toContain('door');
    expect(info.tickets).toBe(1);
  });
  it('gives the door the list it needs to check codes itself', async () => {
    const { e, ev, key } = await setup(), p = await phone();
    const iss = await j(call(e, `/v1/tickets/${ev}/issue`, { pub: p.pub, name: 'Ben' }));
    const d = await j(call(e, `/v1/tickets/${ev}/door`, { key }));
    expect(d.tickets).toHaveLength(1); expect(d.tickets[0].pub).toBe(p.pub); expect(d.tickets[0].name).toBe('Ben'); expect(d.window_ms).toBe(WINDOW_MS);
    expect(iss.ticket.key_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('rejects a bad public key and an unknown event', async () => {
    const { e, ev } = await setup();
    expect((await call(e, `/v1/tickets/${ev}/issue`, { pub: 'abc' })).status).toBe(400);
    expect((await call(e, '/v1/tickets/AAAAAAAAAAAA')).status).toBe(404);
    expect((await call(e, '/v1/tickets', { name: '' })).status).toBe(400);
  });
});

describe('tickets: a door with no signal', () => {
  it('accepts an hours-old code only when the door says it was checked offline', async () => {
    const e = env(), made = await j(call(e, '/v1/tickets', { name: 'Field party' })), ev = made.event.id, key = made.door_key;
    const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
    const iss = await j(call(e, `/v1/tickets/${ev}/issue`, { pub }));
    const w = Math.floor(Date.now() / WINDOW_MS) - 720;   // an hour ago
    const sig = Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.from(codeMessage(ev, iss.ticket.id, w)))).toString('base64url');
    expect((await j(call(e, `/v1/tickets/${ev}/checkin`, { key, ticket: iss.ticket.id, w, sig }))).reason).toBe('stale_code');
    expect((await j(call(e, `/v1/tickets/${ev}/checkin`, { key, ticket: iss.ticket.id, w, sig, late: true }))).ok).toBe(true);
  });
});
