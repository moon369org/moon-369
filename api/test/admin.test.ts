import { describe, it, expect } from 'vitest';
import { handle } from '../src/index.js';
import { memoryKeyStore } from '../src/keys.js';

const TOKEN = 'a'.repeat(48);
const env = () => { const k = memoryKeyStore(); return { API_KEYS: k, KEYS_WRITE: k, ADMIN_TOKEN: TOKEN }; };
const post = (e: object, path: string, body: object, token: string | null = TOKEN) => handle(new Request('https://x' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Moon-Admin': token } : {}) }, body: JSON.stringify(body) }), e as never);

describe('admin: one-step verified keys', () => {
  it('issues a verified business key that works right away', async () => {
    const e = env();
    const r = await post(e, '/v1/admin/keys', { owner: 'Acme Studio', email: 'a@acme.co' });
    expect(r.status).toBe(201);
    const j = await r.json() as { key: string; plan: string; per_min: number; owner_verified: boolean };
    expect(j.key).toMatch(/^moon_/); expect(j.plan).toBe('business'); expect(j.per_min).toBe(300); expect(j.owner_verified).toBe(true);
    const me = await handle(new Request('https://x/v1/me', { headers: { Authorization: 'Bearer ' + j.key } }), e as never);
    const m = await me.json() as Record<string, unknown>;
    expect(me.status).toBe(200);
    expect(JSON.stringify(m)).toContain('Acme Studio');
    expect(JSON.stringify(m)).toMatch(/"verified":true|"owner_verified":true/);
  });
  it('switches a key off and on', async () => {
    const e = env();
    const { key } = await (await post(e, '/v1/admin/keys', { owner: 'Acme Studio' })).json() as { key: string };
    const me = () => handle(new Request('https://x/v1/me', { headers: { Authorization: 'Bearer ' + key } }), e as never);
    expect((await post(e, '/v1/admin/keys/off', { key })).status).toBe(200);
    expect((await me()).status).toBe(403);
    expect((await post(e, '/v1/admin/keys/on', { key })).status).toBe(200);
    expect((await me()).status).toBe(200);
  });
  it('refuses without the right token, and hides the routes when no token is set', async () => {
    const e = env();
    expect((await post(e, '/v1/admin/keys', { owner: 'X Corp' }, null)).status).toBe(403);
    expect((await post(e, '/v1/admin/keys', { owner: 'X Corp' }, 'b'.repeat(48))).status).toBe(403);
    expect((await post({ ...e, ADMIN_TOKEN: undefined }, '/v1/admin/keys', { owner: 'X Corp' })).status).toBe(404);
  });
  it('checks its inputs', async () => {
    const e = env();
    expect((await post(e, '/v1/admin/keys', { owner: 'A' })).status).toBe(400);
    expect((await post(e, '/v1/admin/keys', { owner: 'Acme', plan: 'free' })).status).toBe(400);
    expect((await post(e, '/v1/admin/keys', { owner: 'Acme', per_min: 0 })).status).toBe(400);
    expect((await post(e, '/v1/admin/keys/off', { key: 'moon_nope' })).status).toBe(404);
  });
});
