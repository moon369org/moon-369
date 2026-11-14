import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseOtsFile, serializeNode, otsFile, summarize, stamp, upgrade, parseNode } from '../src/ots';

const fx = (n: string) => readFileSync(new URL('./fixtures/' + n, import.meta.url));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('OpenTimestamps (official example proofs)', () => {
  for (const name of ['hello-world.txt', 'incomplete.txt', 'two-calendars.txt', 'merkle2.txt']) {
    it(`${name}: parses, commits to the file, and re-serializes byte for byte`, () => {
      const f = fx(name + '.ots');
      const { digest, root } = parseOtsFile(f);
      expect(digest.toString('hex')).toBe(sha(fx(name)));
      expect(otsFile(digest, root).equals(f)).toBe(true);
    });
  }
  it('reads the attestations', () => {
    expect(summarize(fx('hello-world.txt.ots')).bitcoin).toEqual([358391]);   // the well-known hello-world block
    const inc = summarize(fx('incomplete.txt.ots'));
    expect(inc.bitcoin).toEqual([]);
    expect(inc.pending.length).toBeGreaterThan(0);
  });
});

describe('stamp and upgrade (calendars mocked)', () => {
  it('stamps at the calendars and merges their answers', async () => {
    // A calendar answers with a timestamp tree for our digest; reuse a real pending subtree.
    const pendingTree = serializeNode(parseOtsFile(fx('incomplete.txt.ots')).root);
    const fake = (async () => new Response(pendingTree)) as unknown as typeof fetch;
    const digest = createHash('sha256').update('tide').digest('hex');
    const f = await stamp(digest, fake, ['https://cal-a.example', 'https://cal-b.example']);
    const s = summarize(f!);
    expect(s.digest).toBe(digest);
    expect(s.pending.length).toBe(2 * summarize(fx('incomplete.txt.ots')).pending.length);
    expect(await stamp(digest, (async () => new Response('', { status: 500 })) as unknown as typeof fetch)).toBeNull();
  });
  it('upgrade leaves a proof alone until a calendar has a Bitcoin answer', async () => {
    const f = fx('incomplete.txt.ots');
    const r = await upgrade(f, (async () => new Response('', { status: 404 })) as unknown as typeof fetch);
    expect(r.changed).toBe(false);
    expect(r.file.equals(f)).toBe(true);
  });
  it('upgrade splices in the Bitcoin path when the calendar has it', async () => {
    const f = fx('incomplete.txt.ots');
    const btcSub = (() => { // any subtree that ends in a Bitcoin attestation
      const hw = parseOtsFile(fx('hello-world.txt.ots')).root;
      const find = (n: any): any => n.atts.some((a: any) => a.tag === '0588960d73d71901') ? n : n.ops.map((o: any) => find(o.child)).find(Boolean);
      return serializeNode(find(hw));
    })();
    const r = await upgrade(f, (async () => new Response(btcSub)) as unknown as typeof fetch);
    expect(r.changed).toBe(true);
    expect(summarize(r.file).bitcoin.length).toBeGreaterThan(0);
    expect(() => parseNode(Buffer.from([0x42]))).toThrow();
  });
});
