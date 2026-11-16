// Saves each page's first render as plain HTML inside the page, so text shows on the
// very first paint (before any script runs). dc-lite swaps in the live page and removes
// the snapshot in the same frame. Run after changing a page, with the site served locally:
//   cd site && python3 -m http.server 8765 &   then   node scripts/prerender.cjs
// Needs puppeteer-core and Chrome (CHROME=/path/to/chrome).
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const SITE = path.join(__dirname, '..', 'site');
const PAGES = ['index', 'calendar', 'api', 'm', 'uses', 'see', 'trust', 'quantum', 'tideline', 'evidence', 'check', 'night', 'eclipses', 'eclipse', 'press', 'by', 'notarize'];
const BASE = process.env.BASE || 'http://localhost:8765';

function hoistHelmet(html) {
  // Page CSS must apply before the scripts run, so <helmet> moves into <head> once.
  const m = /<helmet>([\s\S]*?)<\/helmet>\n?/.exec(html);
  if (!m) return html;
  html = html.replace(m[0], '');
  return html.replace('</head>', '<!-- page styles -->\n' + m[1].trim() + '\n</head>');
}

(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const name of PAGES) {
    const file = path.join(SITE, name + '.html');
    let html = hoistHelmet(fs.readFileSync(file, 'utf8'));
    html = html.replace(/<!--snapshot-->[\s\S]*?<!--\/snapshot-->\n?/, '');
    fs.writeFileSync(file, html);
    const pg = await b.newPage();
    await pg.setViewport({ width: 1440, height: 900 });
    await pg.goto(`${BASE}/${name}.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2500));
    const snap = await pg.evaluate(async () => {
      const root = document.querySelector('[data-dc-root]');
      const texts = () => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) out.push(w.currentNode.nodeValue); return out; };
      const a = texts(); await new Promise((r) => setTimeout(r, 1300)); const b2 = texts();
      const clone = root.cloneNode(true);
      // Text that changes by itself (clocks, counters) is hidden until the live page takes over.
      const w = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT); let i = 0; const live = [];
      while (w.nextNode()) { if (a[i] !== b2[i]) live.push(w.currentNode); i++; }
      live.forEach((t) => { const s = document.createElement('span'); s.style.visibility = 'hidden'; t.replaceWith(s); s.appendChild(t); });
      clone.querySelectorAll('[data-mk-root]').forEach((e) => { e.innerHTML = ''; });   // filled from the URL
      clone.querySelectorAll('svg').forEach((v) => { if (v.outerHTML.length > 15000) v.innerHTML = ''; });   // big maps: keep the space, skip the weight
      clone.querySelectorAll('canvas').forEach((c) => { c.removeAttribute('width'); c.removeAttribute('height'); });
      clone.removeAttribute('data-dc-root');
      clone.setAttribute('data-dc-snapshot', '');
      clone.setAttribute('aria-hidden', 'true');
      return clone.outerHTML;
    });
    await pg.close();
    html = fs.readFileSync(file, 'utf8').replace('<x-dc>', '<!--snapshot-->' + snap + '<!--/snapshot-->\n<x-dc>');
    fs.writeFileSync(file, html);
    console.log(name, Math.round(snap.length / 1024) + ' KB');
  }
  await b.close();
})();
