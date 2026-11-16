import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { handle } from '../src/index.js';
import { Signer } from '../src/receipt.js';
import { memoryRegistry, hamming, bands, isPhash } from '../src/registry.js';

const env = () => ({ SIGNER: new Signer(generateKeyPairSync('ed25519').privateKey), REGISTRY: memoryRegistry() });
const post = (e: object, path: string, body: object) => handle(new Request('https://x' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e as never);

describe('video and audio look-alikes', () => {
  it('keeps kinds apart', () => {
    expect(isPhash('v:0123456789abcdef')).toBe(true); expect(isPhash('a:0123456789abcdef')).toBe(true); expect(isPhash('x:0123456789abcdef')).toBe(false);
    expect(hamming('v:0123456789abcdef', '0123456789abcdef')).toBe(64);
    expect(hamming('v:0123456789abcdef', 'v:0123456789abcdee')).toBe(1);
    expect(bands('v:0123456789abcdef')[0]).toBe('v0:0123'); expect(bands('0123456789abcdef')[0]).toBe('0:0123');
  });
  it('finds a re-encoded video, and not an image with the same bits', async () => {
    const e = env();
    await post(e, '/v1/sign', { sha256: 'aa'.repeat(32), phash: 'v:2424242424242424' });
    await post(e, '/v1/sign', { sha256: 'bb'.repeat(32), phash: '2424242424242424' });
    const v = await (await post(e, '/v1/lookup/similar', { phash: 'v:2424242424242425' })).json() as { kind: string; matches: { sha256: string }[] };
    expect(v.kind).toBe('video'); expect(v.matches.map((m) => m.sha256)).toEqual(['aa'.repeat(32)]);
    const a = await (await post(e, '/v1/lookup/similar', { phash: 'a:2424242424242424' })).json() as { matches: unknown[] };
    expect(a.matches).toHaveLength(0);
  });
});
