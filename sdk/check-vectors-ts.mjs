import { readFileSync } from 'node:fs';
import { verify, moonmark, fromMoonmark } from '../packages/moon369/dist/index.js';
const v = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));
let ok = true;
for (const c of v.conversions) { const m = moonmark(BigInt(c.unix_ns)); const e = fromMoonmark(c.moonmark).toString(); if (m !== c.moonmark || e !== c.earliest_unix_ns) { ok = false; console.log('conv', c, m, e); } }
for (const t of v.valid) { const r = await verify(t.receipt, { keys: v.keys, sha256: v.sha256 }); if (!r.valid) { ok = false; console.log('valid failed', t.name, r); } }
for (const t of v.invalid) { const r = await verify(t.receipt, { keys: v.keys }); if (r.valid || r.reason !== t.reason) { ok = false; console.log('invalid', t.name, r); } }
const r = await verify(v.valid[0].receipt, { keys: v.keys, sha256: v.content.other }); if (r.reason !== 'content_mismatch') { ok = false; console.log('content', r); }
console.log(ok ? 'ALL VECTORS PASS (TypeScript)' : 'FAIL');
