#!/usr/bin/env node
// Moon signed audit trail: hash-chain every log line and have Moon sign the chain head every minute.
//
//   your-app | node chain.mjs --out audit.jsonl [--every 60] [--key $MOON_KEY]
//
// Each line becomes {"n","t","line","prev","hash"} with hash = SHA-256(prev + "\n" + line), so changing,
// removing or reordering any line breaks every hash after it. Every --every seconds (and at the end) the
// newest hash is signed on Moon: {"seal":{"n","head","receipt"}}. A seal proves every line up to n existed
// by then. Only the 64-character hash is sent, never a log line. Check a file with verify.mjs.
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', 'audit.jsonl'), EVERY = Number(arg('every', 60)) * 1000;
const API = arg('api', 'https://api.moon369.org'), KEY = arg('key', process.env.MOON_KEY || '');
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// Continue an existing chain where it left off.
let n = 0, prev = '0'.repeat(64), sealedN = 0;
if (existsSync(OUT)) for (const l of readFileSync(OUT, 'utf8').split('\n')) {
  if (!l) continue;
  const r = JSON.parse(l);
  if (r.seal) sealedN = r.seal.n; else { n = r.n; prev = r.hash; }
}
const write = (o) => appendFileSync(OUT, JSON.stringify(o) + '\n');

async function seal() {
  if (n === sealedN) return;
  const at = n, head = prev;
  try {
    const r = await fetch(API + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: 'Bearer ' + KEY } : {}) },
      body: JSON.stringify({ sha256: head, label: 'audit chain head, line ' + at }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.status);
    write({ seal: { n: at, head, receipt: j.receipt, signed_url: j.signed_url } }); sealedN = at;
    process.stderr.write(`sealed line ${at} at ${j.receipt.moonmark}\n`);
  } catch (e) { process.stderr.write(`could not seal (will retry): ${e.message}\n`); }
}

const timer = setInterval(seal, EVERY);
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  n++; const hash = sha(prev + '\n' + line);
  write({ n, t: new Date().toISOString(), line, prev, hash }); prev = hash;
}
clearInterval(timer);
await seal();
