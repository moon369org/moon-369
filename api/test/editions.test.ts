import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { handle } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { memoryEditions, statementSha } from '../src/editions.js';

const { privateKey } = generateKeyPairSync('ed25519');
const env = () => ({ SIGNER: new Signer(privateKey), EDITIONS: memoryEditions() });
const statement = (ed = '3') => ['moon-coa/1', 'artist:Ana Ruiz', 'title:Harbor in morning fog', 'year:2026', 'edition:' + ed, 'master:' + 'ab'.repeat(32)].join('\n');
const post = (e: object, path: string, body: object) => handle(new Request('https://x' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e as never);
const get = (e: object, path: string) => handle(new Request('https://x' + path), e as never);

async function signed(e: object, text: string) {
  const r = await post(e, '/v1/sign', { sha256: statementSha(text) });
  return ((await r.json()) as { receipt: object }).receipt;
}

describe('edition registry', () => {
  it('gives every print its own ID, once', async () => {
    const e = env(), text = statement(), receipt = await signed(e, text);
    const a = await (await post(e, '/v1/editions', { statement: text, receipt })).json() as { prints: { print: number; id: string }[]; edition: number };
    expect(a.edition).toBe(3); expect(a.prints).toHaveLength(3);
    expect(new Set(a.prints.map((p) => p.id)).size).toBe(3);
    const b = await (await post(e, '/v1/editions', { statement: text, receipt })).json() as { prints: { id: string }[] };
    expect(b.prints.map((p) => p.id)).toEqual(a.prints.map((p) => p.id));   // registering again changes nothing
  });
  it('confirms a real print and counts its checks', async () => {
    const e = env(), text = statement(), receipt = await signed(e, text), sha = statementSha(text);
    const { prints } = await (await post(e, '/v1/editions', { statement: text, receipt })).json() as { prints: { print: number; id: string }[] };
    const c1 = await (await get(e, `/v1/editions/${sha}/2?id=${prints[1].id}`)).json() as { valid: boolean; checks: number; print: number; edition: number };
    const c2 = await (await get(e, `/v1/editions/${sha}/2?id=${prints[1].id}`)).json() as { checks: number };
    expect(c1.valid).toBe(true); expect(c1.print).toBe(2); expect(c1.edition).toBe(3); expect(c1.checks).toBe(1); expect(c2.checks).toBe(2);
  });
  it('rejects a changed or invented print number', async () => {
    const e = env(), text = statement(), receipt = await signed(e, text), sha = statementSha(text);
    const { prints } = await (await post(e, '/v1/editions', { statement: text, receipt })).json() as { prints: { id: string }[] };
    expect(((await (await get(e, `/v1/editions/${sha}/3?id=${prints[1].id}`)).json()) as { valid: boolean }).valid).toBe(false);
    expect(((await (await get(e, `/v1/editions/${sha}/4?id=${prints[1].id}`)).json()) as { valid: boolean }).valid).toBe(false);
    expect(((await (await get(e, `/v1/editions/${'cd'.repeat(32)}/1?id=x`)).json()) as { registered: boolean }).registered).toBe(false);
  });
  it('only registers statements Moon actually signed', async () => {
    const e = env(), receipt = await signed(e, statement());
    expect((await post(e, '/v1/editions', { statement: statement('4'), receipt })).status).toBe(400);
    expect((await post(e, '/v1/editions', { statement: statement('unique'), receipt })).status).toBe(400);
    expect((await post(e, '/v1/editions', { statement: 'hello', receipt })).status).toBe(400);
  });
});
