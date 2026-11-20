#!/usr/bin/env node
// Every page with the site's main nav must use the same header, so the top bar never drifts between pages.
// Checks each site/*.html against index.html: the header markup (ignoring which link is marked current)
// and the files that style and run it. Exits 1 and names the page when one differs. Runs in CI.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'site');
const norm = (h) => h.replace(/\s+/g, ' ').replace(/ aria-current="page"/g, '').trim();
// The header as written in the page source (the dc-lite template form, or a hand-built copy of it).
const source = (html) => (html.match(/<header[\s\S]*?<\/header>/g) || []).map(norm).filter((h) => h.includes('#1C1D20'));
const NEEDS = ['moon-motion.css', 'js/moon-motion.js', 'js/header.js', 'js/i18n.js'];

const ref = source(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'))[0];
if (!ref) { console.error('check-headers: no header found in index.html'); process.exit(1); }
const bad = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  if (!html.includes('nav aria-label="Main"')) continue;   // pages without the site header (the app, tickets, doors) are their own thing
  const hs = source(html);
  if (!hs.length) bad.push(`${f}: no header in source form`);
  else if (hs.some((h) => h !== ref)) bad.push(`${f}: header differs from index.html`);
  for (const n of NEEDS) if (!html.includes(n)) bad.push(`${f}: missing ${n}`);
}
if (bad.length) { console.error('Header check failed:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('check-headers: every page with the main nav uses the same header');
