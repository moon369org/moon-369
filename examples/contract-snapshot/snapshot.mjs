#!/usr/bin/env node
// Freeze the exact version of a contract, terms page or document, and sign it on Moon.
// Zero dependencies, Node 18+. Only the SHA-256 fingerprint leaves your machine.
//
//   node snapshot.mjs https://example.com/terms            # save the page exactly as served, then sign it
//   node snapshot.mjs contract-final.pdf                  # sign a file you already have
//
// Writes the snapshot (for URLs: <host>-<date>.html), <snapshot>.moonmark.json with the receipt, and prints the
// proof link. Keep the snapshot file: it's what proves the wording. Anyone can drop it on moon369.org/verify.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const API = process.env.MOON_API || 'https://api.moon369.org', key = process.env.MOON_KEY;
const target = process.argv[2];
if (!target) { console.error('Usage: node snapshot.mjs <url or file>'); process.exit(2); }

let bytes, file, source = null;
if (/^https?:\/\//i.test(target)) {
  const r = await fetch(target, { redirect: 'follow', headers: { 'User-Agent': 'moon-snapshot/1 (+https://moon369.org)' } });
  if (!r.ok) throw new Error(`${target} returned ${r.status}`);
  bytes = Buffer.from(await r.arrayBuffer());
  const u = new URL(r.url), ct = r.headers.get('content-type') || '', ext = /pdf/i.test(ct) ? 'pdf' : /text\/plain/i.test(ct) ? 'txt' : /json/i.test(ct) ? 'json' : 'html';
  file = `${u.hostname}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${ext}`;
  await writeFile(file, bytes);
  source = { url: target, final_url: r.url, status: r.status, content_type: r.headers.get('content-type') };
} else { bytes = await readFile(target); file = target; }

const sha256 = createHash('sha256').update(bytes).digest('hex');
const r = await fetch(API + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
  body: JSON.stringify({ sha256, label: `Snapshot: ${basename(file)}`.slice(0, 120) }) });
const b = await r.json();
if (!r.ok) throw new Error(b?.error?.message || 'Moon returned ' + r.status);

await writeFile(file + '.moonmark.json', JSON.stringify({ file: basename(file), sha256, source, receipt: b.receipt, signed_url: b.signed_url }, null, 2) + '\n');
console.log(`Snapshot ${basename(file)} signed at ${b.receipt.moonmark.slice(0, 19)} (Moon time)\n${b.signed_url}`);
