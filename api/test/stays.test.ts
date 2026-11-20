import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, webcrypto, createPublicKey, verify } from 'node:crypto';
import { handle } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { memoryStays, stayCodeMessage, passBytes, CODE_MS, zoned, stayPin, dayNumber } from '../src/stays.js';

const { privateKey } = generateKeyPairSync('ed25519');
const env = () => ({ SIGNER: new Signer(privateKey), STAYS: memoryStays() });
const call = (e: object, path: string, body?: object) => handle(new Request('https://x' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), e as never);
const j = async (r: Response | Promise<Response>) => (await r).json() as Promise<Record<string, any>>;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
async function phone() {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  const code = async (d: string, s: string, w = Math.floor(Date.now() / CODE_MS)) => ({ w, sig: Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.from(stayCodeMessage(d, s, w)))).toString('base64url') });
  return { pub, code };
}
async function booked(arrive = day(-1), depart = day(2)) {
  const e = env();
  const made = await j(call(e, '/v1/stays', { name: 'Wilson Cabin 1', tz: 'America/Denver' }));
  const D = made.door.id as string, key = made.key as string;
  const b = await j(call(e, `/v1/stays/${D}/book`, { key, guest: 'Avery', arrive, depart }));
  const ph = await phone(), tok = new URL(b.link).searchParams.get('i');
  const joined = await j(call(e, `/v1/stays/${D}/join`, { invite: tok, pub: ph.pub }));
  return { e, D, key, b, ph, tok, joined, S: b.stay.id as string };
}

describe('stays', () => {
  it('signs a pass a lock can check offline with Moon\'s public key', async () => {
    const { e, D, joined, ph } = await booked();
    const keys = await j(call(e, '/v1/keys'));
    const k = keys.keys.find((x: any) => x.key_id === joined.pass.key_id);
    const pk = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: k.public_key }, format: 'jwk' });
    const ok = verify(null, passBytes(D, joined.stay.id, ph.pub, joined.pass.nb, joined.pass.na), pk, Buffer.from(joined.pass.sig, 'base64url'));
    expect(ok).toBe(true);
    expect(joined.pass.na - joined.pass.nb).toBeLessThanOrEqual(24 * 3600);
  });
  it('turns arrival and departure dates into the door\'s check-in and check-out times', async () => {
    const { b } = await booked('2026-07-10', '2026-07-13');
    expect(b.stay.check_in).toBe('2026-07-10T21:00:00.000Z');   // 3 PM Mountain Daylight Time
    expect(b.stay.check_out).toBe('2026-07-13T17:00:00.000Z');  // 11 AM
    expect(new Date(zoned('America/Denver', 2026, 1, 10, 15)).toISOString()).toBe('2026-01-10T22:00:00.000Z');
  });
  it('a PIN the lock can rebuild offline from the arrival day and nights', async () => {
    const { b } = await booked('2026-07-10', '2026-07-13');
    expect(b.pin).toMatch(/^\d{10}$/);
    expect(Number(b.pin.slice(0, 3))).toBe(dayNumber('2026-07-10') % 1000);
    expect(b.pin.slice(3, 5)).toBe('03');
  });
  it('renews the pass for its phone only, and stops after cancelling', async () => {
    const { e, D, key, ph, S } = await booked();
    expect((await j(call(e, `/v1/stays/${D}/pass`, { stay: S, ...(await ph.code(D, S)) }))).pass.sig).toBeTruthy();
    const other = await phone();
    expect((await call(e, `/v1/stays/${D}/pass`, { stay: S, ...(await other.code(D, S)) })).status).toBe(403);
    await call(e, `/v1/stays/${D}/cancel`, { key, stay: S });
    expect((await call(e, `/v1/stays/${D}/pass`, { stay: S, ...(await ph.code(D, S)) })).status).toBe(410);
    const lock = await j(call(e, `/v1/stays/${D}/lock`, { key }));
    expect(lock.revoked.map((r: any) => r.stay)).toContain(S);
    expect(lock.pin_secret).toBeTruthy();
  });
  it('an invite works once', async () => {
    const { e, D, tok } = await booked();
    expect((await call(e, `/v1/stays/${D}/join`, { invite: tok, pub: (await phone()).pub })).status).toBe(410);
  });
  it('the lock sends its log later; Moon checks each QR opening and signs it', async () => {
    const { e, D, key, ph, S, b } = await booked();
    const c = await ph.code(D, S);
    const r = await j(call(e, `/v1/stays/${D}/log`, { key, visits: [
      { method: 'qr', stay: S, at: new Date().toISOString(), ...c },
      { method: 'qr', stay: S, at: new Date().toISOString(), w: c.w, sig: (await (await phone()).code(D, S)).sig },
      { method: 'pin', pin_day: dayNumber(b.stay.arrive), nights: 3, at: new Date().toISOString() },
    ] }));
    expect(r.logged).toBe(2);
    const host = await j(call(e, `/v1/stays/${D}/host`, { key }));
    expect(host.stays[0].openings).toBe(2); expect(host.visits[0].moonmark).toBeTruthy();
  });
  it('the PIN in the response matches the shared formula', async () => {
    const { e, D, key } = await booked('2026-08-01', '2026-08-04');
    const lock = await j(call(e, `/v1/stays/${D}/lock`, { key }));
    const host = await j(call(e, `/v1/stays/${D}/host`, { key }));
    expect(host.stays[0].pin).toBe(stayPin(lock.pin_secret, D, '2026-08-01', 3));
  });
});
