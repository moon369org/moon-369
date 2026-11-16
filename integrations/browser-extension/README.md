# Moon: sign anything (browser extension)

Right-click any **image**, **selected text** or **page** and choose *Sign with Moon*. Moon signs its SHA-256
fingerprint at that moment and a result tab shows the proof link, a QR code, the receipt, and the exact bytes that
were signed, to save. Only the fingerprint (and, for images, Moon's 64-bit look-alike hash) leaves the browser.

## Install (developer mode, until it's in the Chrome Web Store)

1. Download this folder (`integrations/browser-extension`).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the folder.
3. Pin the Moon icon. Its popup signs the current page and holds an optional API key.

Works in Chrome, Edge, Brave and other Chromium browsers.

## What gets signed

- **Image:** the image file exactly as the site serves it. Save it from the result tab to verify later.
- **Selected text:** the text as the browser reports the selection.
- **Page:** the page's full HTML as your browser shows it right now, including anything scripts added. It proves
  what you saw at that moment, not who runs the site.

Check anything saved from the result tab at [moon369.org/verify](https://moon369.org/verify).

`moon-phase.js`, `moonqr.js` and `qrcode.js` are copies from `site/js`; `node scripts/build-extension.cjs` refreshes them and builds a zip for the store.
