import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { handle, type Env } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { envKeyStore, hashKey, memoryKeyStore, chainKeyStores } from '../src/keys.js';
import { memoryRegistry } from '../src/registry.js';
import { memoryLimiter } from '../src/ratelimit.js';

const kp = generateKeyPairSync('ed25519');
const HAND = 'moon_hand_issued_key';
function env(): Env {
  const self = memoryKeyStore();
  return {
    SIGNER: new Signer(kp.privateKey), REGISTRY: memoryRegistry(),
    API_KEYS: chainKeyStores(envKeyStore(JSON.stringify({ [hashKey(HAND)]: { owner: 'Halden Stock', plan: 'pro' } })), self),
    KEYS_WRITE: self, KEY_CREATE_LIMIT: memoryLimiter(3, 86_400_000), FREE_SIGN_DAY: memoryLimiter(2, 86_400_000), FREE_LIMITS: { per_min: 60, sign_per_day: 2 },
  };
}
const post = (e: Env, path: string, body: unknown, key?: string, ip = '1.2.3.4') => handle(new Request('http://x' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip, ...(key ? { Authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body) }), e);
const get = (e: Env, path: string, key?: string) => handle(new Request('http://x' + path, { headers: key ? { Authorization: 'Bearer ' + key } : {} }), e);
const SHA = 'ef'.repeat(32);

describe('self-serve API keys', () => {
  it('issues a free key that works straight away, with the name marked unverified', async () => {
    const e = env();
    const r = await post(e, '/v1/api-keys', { name: 'Getty Images', email: 'dev@example.com', use: 'testing' });
    expect(r.status).toBe(201);
    const k = await r.json() as { key: string; plan: string; owner_verified: boolean };
    expect(k.key).toMatch(/^moon_/); expect(k.plan).toBe('free'); expect(k.owner_verified).toBe(false);
    const me = await (await get(e, '/v1/me', k.key)).json() as { plan: string; owner: string; owner_verified: boolean };
    expect(me).toMatchObject({ plan: 'free', owner: 'Getty Images', owner_verified: false });
    await post(e, '/v1/sign', { sha256: SHA }, k.key);
    const lk = await (await get(e, '/v1/lookup/' + SHA)).json() as { first: { registrant: string; registrant_verified: boolean } };
    expect(lk.first.registrant).toBe('Getty Images');
    expect(lk.first.registrant_verified).toBe(false);   // anyone can type a famous name; Moon does not vouch for it
  });
  it('keeps hand-issued keys verified', async () => {
    const e = env();
    await post(e, '/v1/sign', { sha256: SHA }, HAND);
    const lk = await (await get(e, '/v1/lookup/' + SHA)).json() as { first: { registrant_verified: boolean } };
    expect(lk.first.registrant_verified).toBe(true);
  });
  it('checks the form, limits new keys per address and caps free signing', async () => {
    const e = env();
    expect((await post(e, '/v1/api-keys', { name: 'A', email: 'x@y.z' })).status).toBe(400);
    expect((await post(e, '/v1/api-keys', { name: 'Ana', email: 'not-an-email' })).status).toBe(400);
    for (let i = 0; i < 3; i++) expect((await post(e, '/v1/api-keys', { name: 'Ana ' + i, email: 'a@b.co' }, undefined, '9.9.9.9')).status).toBe(201);
    expect((await post(e, '/v1/api-keys', { name: 'Ana 4', email: 'a@b.co' }, undefined, '9.9.9.9')).status).toBe(429);
    const k = (await (await post(e, '/v1/api-keys', { name: 'Bo', email: 'b@b.co' }, undefined, '8.8.8.8')).json() as { key: string }).key;
    expect((await post(e, '/v1/sign', { sha256: SHA }, k)).status).toBe(200);
    expect((await post(e, '/v1/sign', { sha256: SHA }, k)).status).toBe(200);
    expect((await post(e, '/v1/sign', { sha256: SHA }, k)).status).toBe(429);
  });
  it('says so when self-serve keys are not switched on', async () => {
    expect((await post({}, '/v1/api-keys', { name: 'Ana', email: 'a@b.co' })).status).toBe(503);
  });
});

describe('MCP server', () => {
  const rpc = (e: Env, msg: unknown) => handle(new Request('http://x/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(msg) }), e);
  it('initializes, lists tools and answers pings', async () => {
    const init = await (await rpc({}, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json() as { result: { protocolVersion: string; serverInfo: { name: string }; capabilities: { tools: unknown } } };
    expect(init.result.protocolVersion).toBe('2025-06-18'); expect(init.result.serverInfo.name).toBe('moon'); expect(init.result.capabilities.tools).toBeTruthy();
    expect((await rpc({}, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    const list = await (await rpc({}, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json() as { result: { tools: { name: string; inputSchema: unknown }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(expect.arrayContaining(['moon_time', 'moon_on_date', 'next_solar_eclipse', 'solar_eclipse_on', 'list_solar_eclipses', 'timestamp_fingerprint', 'lookup_fingerprint', 'verify_receipt']));
    expect(((await (await rpc({}, { jsonrpc: '2.0', id: 3, method: 'ping' })).json()) as { result: unknown }).result).toEqual({});
  });
  it('calls tools through the API', async () => {
    const call = async (name: string, args: unknown, e: Env = {}) => ((await (await rpc(e, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } })).json()) as { result: { isError?: boolean; structuredContent?: Record<string, unknown>; content: { text: string }[] } }).result;
    expect((await call('solar_eclipse_on', { date: '2024-04-08' })).structuredContent).toMatchObject({ type: 'total', saros: 139 });
    expect((await call('moon_on_date', { date: '1969-07-20', time: '20:17', utc_offset: '+00:00' })).structuredContent).toMatchObject({ phase: 'Waxing crescent' });
    expect((await call('next_solar_eclipse', { type: 'total', after: '2026-11-15T00:00:00Z' })).structuredContent).toMatchObject({ date: '2027-08-02' });
    expect((await call('moon_time', { utc: '2026-11-15T00:00:00Z' })).structuredContent).toHaveProperty('moonmark');
    expect((await call('list_solar_eclipses', { from_year: 2026, to_year: 2030, type: 'total' })).structuredContent).toMatchObject({ count: 4 });
    const bad = await call('solar_eclipse_on', { date: '2024-04-09' });
    expect(bad.isError).toBe(true);
    expect((await call('solar_eclipse_on', {})).isError).toBe(true);
    const signed = await call('timestamp_fingerprint', { sha256: SHA, label: 'test' }, env());
    expect(signed.structuredContent).toHaveProperty('signed_url');
  });
  it('rejects unknown methods and bad JSON', async () => {
    expect(((await (await rpc({}, { jsonrpc: '2.0', id: 1, method: 'nope' })).json()) as { error: { code: number } }).error.code).toBe(-32601);
    const r = await handle(new Request('http://x/mcp', { method: 'POST', body: '{not json' }), {});
    expect(r.status).toBe(400);
    expect((await handle(new Request('http://x/mcp'), {})).status).toBe(405);
  });
});
