// Builds integrations/figma/ui.html: Figma plugin panels are one HTML file, so the site's QR and moon code are inlined.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dir = path.join(root, 'integrations/figma');
const lib = ['qrcode.js', 'moon-phase.js', 'moonqr.js'].map((f) => fs.readFileSync(path.join(root, 'site/js', f), 'utf8').replace(/<\/script/gi, '<\\/script')).join('\n;\n');
const html = fs.readFileSync(path.join(dir, 'ui.src.html'), 'utf8').replace('/*INLINE*/', () => lib);
fs.writeFileSync(path.join(dir, 'ui.html'), html);
console.log('integrations/figma/ui.html', Math.round(html.length / 1024) + ' KB');
