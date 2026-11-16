#!/usr/bin/env node
// moon369: Moon time and signed Moonmarks from the command line. Only SHA-256 fingerprints leave your machine.
//   npx moon369 now                          the current Moonmark
//   npx moon369 sign <files...>               sign files; writes <file>.moonmark.json and prints each proof link
//   npx moon369 sign --text "any text"        sign text exactly as given
//   npx moon369 verify <file> [receipt]       check a file against its receipt (default <file>.moonmark.json)
// Options: --key <api key> (or MOON_KEY), --label <text>, --json. MOON_API changes the API base.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { moonmark, verify, fetchKeys } from '../dist/index.js';

const API = (process.env.MOON_API || 'https://api.moon369.org').replace(/\/$/, '');
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf('--' + k); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const bool = (k) => { const i = argv.indexOf('--' + k); if (i < 0) return false; argv.splice(i, 1); return true; };
const cmd = argv.shift();
const key = flag('key') || process.env.MOON_KEY, label = flag('label'), text = flag('text'), asJson = bool('json');
const die = (m, code = 1) => { console.error(m); process.exit(code); };

const shaFile = (f) => new Promise((ok, no) => { const h = createHash('sha256'); createReadStream(f).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no); });

async function sign(sha256, lab) {
  const r = await fetch(API + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
    body: JSON.stringify({ sha256, ...(lab ? { label: lab.slice(0, 120) } : {}) }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 429 ? 'Moon is rate-limiting this address. Wait a minute, or add a free key: https://moon369.org/api#key' : (b?.error?.message || 'Moon returned ' + r.status));
  return b;
}

if (cmd === 'now') {
  console.log(moonmark());
} else if (cmd === 'sign') {
  if (text === undefined && !argv.length) die('Usage: moon369 sign <files...>  or  moon369 sign --text "..."', 2);
  const out = [];
  if (text !== undefined) {
    const sha = createHash('sha256').update(text, 'utf8').digest('hex'), b = await sign(sha, label);
    out.push({ text: true, sha256: sha, moonmark: b.receipt.moonmark, signed_url: b.signed_url, receipt: b.receipt });
  }
  for (const f of argv) {
    const st = await stat(f).catch(() => null);
    if (!st || !st.isFile()) die(`Not a file: ${f}`, 2);
    const sha = await shaFile(f), b = await sign(sha, label ? `${label} ${basename(f)}` : basename(f));
    await writeFile(f + '.moonmark.json', JSON.stringify(b.receipt, null, 2) + '\n');
    out.push({ file: f, sha256: sha, moonmark: b.receipt.moonmark, signed_url: b.signed_url, receipt: b.receipt });
  }
  if (asJson) console.log(JSON.stringify(out, null, 2));
  else for (const o of out) console.log(`${o.file ?? 'text'}  ${o.moonmark.slice(0, 19)}  ${o.signed_url}${o.file ? `\n  receipt: ${o.file}.moonmark.json` : `\n  receipt: ${JSON.stringify(o.receipt)}`}`);
} else if (cmd === 'verify') {
  const [f, rf] = argv;
  if (!f) die('Usage: moon369 verify <file> [receipt.json]', 2);
  let rc = JSON.parse(await readFile(rf || f + '.moonmark.json', 'utf8'));
  if (rc && typeof rc.receipt === 'object') rc = rc.receipt;                                    // {receipt: {...}} wrappers
  if (rc && Array.isArray(rc.files)) rc = (rc.files.find((x) => basename(x.path) === basename(f)) || {}).receipt;   // the Action's moon-receipts.json
  const keys = await fetchKeys(API + '/v1/keys');
  const res = await verify(rc, { keys, sha256: await shaFile(f) });
  if (asJson) console.log(JSON.stringify(res, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  else if (res.valid) console.log(`VALID: ${basename(f)} existed at Moonmark ${res.moonmark}. The file matches and Moon's signatures check out.`);
  else console.log(`INVALID: ${res.reason.replace(/_/g, ' ')}`);
  process.exit(res.valid ? 0 : 1);
} else {
  console.log('moon369: Moon time and signed Moonmarks\n  moon369 now\n  moon369 sign <files...>  |  moon369 sign --text "..."\n  moon369 verify <file> [receipt.json]\nOptions: --key <api key> (or MOON_KEY), --label <text>, --json   Docs: https://moon369.org/api');
  process.exit(cmd ? 2 : 0);
}
