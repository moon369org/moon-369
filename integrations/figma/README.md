# Moon for Figma

Select a frame and click **Sign selection**. The plugin exports it as PNG, Moon signs the export's SHA-256, and you
get the Moonmark, a QR code and a proof link. Save the signed PNG and its receipt, and optionally drop a small
"Signed on Moon" label with the QR onto the canvas. The design itself never leaves Figma; only the fingerprint is sent.

## Install (development plugin, until it's in the Figma Community)

1. Download this folder (`integrations/figma`). `ui.html` is already built.
2. In the Figma desktop app: **Plugins → Development → Import plugin from manifest…** and choose `manifest.json`.
3. Run it from **Plugins → Development → Moon: sign your design**.

Keep the saved PNG: it is the exact file that was signed. A later export of the same frame can differ by a byte and
won't match. Anyone can check the PNG at [moon369.org/verify](https://moon369.org/verify).

`ui.html` is built from `ui.src.html` plus the site's QR and moon code: `node scripts/build-figma.cjs`.
