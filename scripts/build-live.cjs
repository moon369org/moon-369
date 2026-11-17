// Builds the one-file <moon-live> script from the site's own moon code, for the site and the moon369 npm package.
//   node scripts/build-live.cjs     writes site/js/moon-live.js and packages/moon369/moon-live.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), js = (f) => fs.readFileSync(path.join(root, 'site/js', f), 'utf8');
const out = '/*! moon-live: Moon\'s live moon as one tag. https://moon369.org/api#moon-image (MIT)\n' +
  ' * <script src="https://cdn.jsdelivr.net/npm/moon369/moon-live.js"></script>\n' +
  ' * <moon-live size="160"></moon-live>     at="<unix ms>" shows another moment\n * <moon-clock size="56"></moon-clock>    live moon + ticking Moon time\n' +
  ' * Built by scripts/build-live.cjs from site/js/moon-phase.js, moonglow.js and moon-live-el.js. Do not edit. */\n' +
  [js('moon-phase.js'), js('moonglow.js'), js('moon-live-el.js')].join('\n;\n');
for (const f of ['site/js/moon-live.js', 'packages/moon369/moon-live.js']) fs.writeFileSync(path.join(root, f), out);
console.log('moon-live.js', Math.round(out.length / 1024) + ' KB');
