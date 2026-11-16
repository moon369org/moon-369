#!/usr/bin/env node
// Check a Moon audit trail written by chain.mjs: every hash, every seal, and Moon's signature on each seal.
//   node verify.mjs audit.jsonl [--api https://api.moon369.org]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const file = process.argv[2], API = (process.argv.indexOf('--api') > 0 ? process.argv[process.argv.indexOf('--api') + 1] : 'https://api.moon369.org');
if (!file) { console.error('usage: node verify.mjs audit.jsonl'); process.exit(2); }
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
let prev = '0'.repeat(64), n = 0, bad = 0, lastSealed = 0, lastMark = '';
const hashes = new Map();
for (const [i, l] of readFileSync(file, 'utf8').split('\n').entries()) {
  if (!l) continue;
  const r = JSON.parse(l);
  if (r.seal) {
    if (hashes.get(r.seal.n) !== r.seal.head) { console.log(`✕ seal for line ${r.seal.n} does not match the chain`); bad++; continue; }
    const v = await (await fetch(API + '/v1/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: r.seal.receipt, sha256: r.seal.head }) })).json();
    if (!v.valid) { console.log(`✕ Moon's signature on the seal for line ${r.seal.n} does not check out`); bad++; continue; }
    lastSealed = r.seal.n; lastMark = r.seal.receipt.moonmark;
    continue;
  }
  n++;
  if (r.n !== n || r.prev !== prev || sha(prev + '\n' + r.line) !== r.hash) { console.log(`✕ line ${n} (file line ${i + 1}) was changed, removed or reordered`); bad++; prev = r.hash; hashes.set(r.n, r.hash); continue; }
  prev = r.hash; hashes.set(n, r.hash);
}
const sealedText = lastSealed ? `lines 1-${lastSealed} sealed by Moon at ${lastMark}` : 'no line has a valid seal';
console.log(`${n} lines · ${bad ? bad + ' problem(s)' : 'chain intact'} · ${sealedText}${lastSealed && lastSealed < n ? ` · lines ${lastSealed + 1}-${n} not sealed yet` : ''}`);
process.exit(bad ? 1 : 0);
