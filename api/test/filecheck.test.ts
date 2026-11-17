import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { checkLinkedFile, isPrivateIp, safeUrl, FILE_CHECK_MAX } from '../src/filecheck';

const pub = async () => ['93.184.216.34'];
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
const serve = (routes: Record<string, () => Response>) => (async (u: string) => (routes[u] ?? (() => new Response('no', { status: 404 })))()) as typeof fetch;

describe('linked file check', () => {
  it('matches the exact file and reports an image', async () => {
    const f = serve({ 'https://art.example/a.png': () => new Response(png, { headers: { 'content-type': 'image/png' } }) });
    const c = await checkLinkedFile('https://art.example/a.png', sha(png), { fetch: f, lookup: pub });
    expect(c).toMatchObject({ match: true, bytes: 8, image: true, content_type: 'image/png' });
  });
  it('says no for a different file', async () => {
    const f = serve({ 'https://art.example/a.png': () => new Response(png, { headers: { 'content-type': 'image/png' } }) });
    expect((await checkLinkedFile('https://art.example/a.png', '0'.repeat(64), { fetch: f, lookup: pub })).match).toBe(false);
  });
  it('follows a safe redirect but refuses one to a private address', async () => {
    const f = serve({
      'https://art.example/r': () => new Response(null, { status: 302, headers: { location: 'https://cdn.example/a.png' } }),
      'https://cdn.example/a.png': () => new Response(png),
      'https://art.example/bad': () => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest' } }),
    });
    expect((await checkLinkedFile('https://art.example/r', sha(png), { fetch: f, lookup: pub })).match).toBe(true);
    await expect(checkLinkedFile('https://art.example/bad', sha(png), { fetch: f, lookup: pub })).rejects.toMatchObject({ code: 'blocked' });
  });
  it('refuses http, odd ports, credentials, local names and private DNS answers', async () => {
    for (const u of ['http://art.example/a', 'https://art.example:8443/a', 'https://u:p@art.example/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a'])
      await expect(safeUrl(u, pub)).rejects.toBeTruthy();
    await expect(safeUrl('https://sneaky.example/a', async () => ['10.0.0.5'])).rejects.toMatchObject({ code: 'blocked' });
    expect(isPrivateIp('8.8.8.8')).toBe(false); expect(isPrivateIp('172.20.1.1')).toBe(true); expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
  });
  it('stops past 25 MB', async () => {
    const big = new Uint8Array(1024 * 1024);
    const f = serve({ 'https://art.example/big': () => new Response(new ReadableStream({ pull(c) { c.enqueue(big); } })) });
    await expect(checkLinkedFile('https://art.example/big', sha(png), { fetch: f, lookup: pub })).rejects.toMatchObject({ code: 'too_large' });
    expect(FILE_CHECK_MAX).toBe(25 * 1024 * 1024);
  });
});
