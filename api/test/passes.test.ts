import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { handle } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { memoryTickets, codeMessage, WINDOW_MS } from '../src/tickets.js';

const { privateKey } = generateKeyPairSync('ed25519');
const env = () => ({ SIGNER: new Signer(privateKey), TICKETS: memoryTickets() });
const call = (e: object, path: string, body?: object) => handle(new Request('https://x' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), e as never);
const j = async (r: Response | Promise<Response>) => (await r).json() as Promise<Record<string, any>>;
async function phone() {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  const code = async (p: string, t: string, w = Math.floor(Date.now() / WINDOW_MS)) =>
    ({ w, sig: Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.from(codeMessage(p, t, w)))).toString('base64url') });
  return { pub, code };
}
async function member(passback = 0) {
  const e = env();
  const made = await j(call(e, '/v1/passes', { name: 'Iron Peak Gym', passback_min: passback }));
  const p = made.place.id as string, key = made.key as string;
  const inv = await j(call(e, `/v1/passes/${p}/invite`, { key, name: 'Ana', days: 30 }));
  const ph = await phone();
  const tok = new URL(inv.link).searchParams.get('i');
  const joined = await j(call(e, `/v1/passes/${p}/join`, { invite: tok, pub: ph.pub }));
  return { e, p, key, ph, tok, joined, id: joined.pass.id as string };
}

describe('passes', () => {
  it('a member joins once through an invite and comes in again and again, each visit signed', async () => {
    const { e, p, key, ph, joined, id } = await member();
    expect(joined.pass.name).toBe('Ana'); expect(joined.statement).toContain('moon-pass/1');
    expect(Date.parse(joined.pass.expires) - Date.now()).toBeGreaterThan(29 * 86_400_000);
    const v1 = await j(call(e, `/v1/passes/${p}/checkin`, { key, ticket: id, ...(await ph.code(p, id)) }));
    const v2 = await j(call(e, `/v1/passes/${p}/checkin`, { key, ticket: id, ...(await ph.code(p, id)) }));
    expect(v1.ok && v2.ok).toBe(true); expect(v2.visits).toBe(2); expect(v2.moonmark).toBeTruthy();
    const st = await j(call(e, `/v1/passes/${p}/${id}`));
    expect(st.status).toBe('active'); expect(st.visits).toBe(2);
  });
  it('an invite works once', async () => {
    const { e, p, tok } = await member();
    const r = await call(e, `/v1/passes/${p}/join`, { invite: tok, pub: (await phone()).pub });
    expect(r.status).toBe(410);
  });
  it('stops a pass being handed back for a second person', async () => {
    const { e, p, key, ph, id } = await member(30);
    expect((await j(call(e, `/v1/passes/${p}/checkin`, { key, ticket: id, ...(await ph.code(p, id)) }))).ok).toBe(true);
    expect((await j(call(e, `/v1/passes/${p}/checkin`, { key, ticket: id, ...(await ph.code(p, id)) }))).reason).toBe('just_in');
  });
  it('a cancelled membership stops working, and renewing brings it back', async () => {
    const { e, p, key, ph, id } = await member();
    await call(e, `/v1/passes/${p}/cancel`, { key, pass: id });
    expect((await j(call(e, `/v1/passes/${p}/checkin`, { key, ticket: id, ...(await ph.code(p, id)) }))).reason).toBe('cancelled');
    const rn = await j(call(e, `/v1/passes/${p}/renew`, { key, pass: id, days: 30 }));
    expect(rn.status).toBe('active');
    expect((await j(call(e, `/v1/passes/${p}/checkin`, { key, ticket: id, ...(await ph.code(p, id)) }))).ok).toBe(true);
  });
  it('another phone cannot use the pass, and owner routes need the key', async () => {
    const { e, p, key, id } = await member();
    const other = await phone();
    expect((await j(call(e, `/v1/passes/${p}/checkin`, { key, ticket: id, ...(await other.code(p, id)) }))).reason).toBe('wrong_phone');
    expect((await call(e, `/v1/passes/${p}/members`, { key: 'x'.repeat(32) })).status).toBe(403);
    const ms = await j(call(e, `/v1/passes/${p}/members`, { key }));
    expect(ms.members.length).toBe(1); expect(ms.members[0].status).toBe('active');
  });
  it('places and events stay apart', async () => {
    const { e, p } = await member();
    expect((await call(e, `/v1/tickets/${p}`)).status).toBe(404);
  });
});
