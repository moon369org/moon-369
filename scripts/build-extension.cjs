// Refreshes the browser extension's copies of the site's moon code and zips it for the Chrome Web Store.
//   node scripts/build-extension.cjs   ->  integrations/browser-extension.zip
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), ext = path.join(root, 'integrations/browser-extension');
for (const f of ['moon-phase.js', 'moonqr.js', 'qrcode.js']) fs.copyFileSync(path.join(root, 'site/js', f), path.join(ext, f));
const zip = path.join(root, 'integrations/browser-extension.zip');
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.', '-x', 'README.md'], { cwd: ext });
console.log('integrations/browser-extension.zip', Math.round(fs.statSync(zip).size / 1024) + ' KB');
