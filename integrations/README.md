# Moon integrations

Sign work on Moon from the tools you already use. Every integration sends only SHA-256 fingerprints (images may also
send Moon's 64-bit look-alike hash), writes or offers the signed receipt, and links to a proof anyone can check at
[moon369.org/verify](https://moon369.org/verify).

| Tool | What it does | Install |
|---|---|---|
| [Browser extension](browser-extension) | Right-click an image, selected text or page to sign it | Load unpacked (Chrome, Edge, Brave) |
| [Figma](figma) | Sign a frame's export; add a Moonmark + QR label | Import plugin from manifest |
| [ComfyUI](comfyui) | Save Image node that signs every generation | Copy into `custom_nodes` |
| [Automatic1111 / Forge](automatic1111) | Signs every image the web UI saves | Copy into `extensions` |
| [Python](python) | `sign_file()` for any generator or API | One file, standard library |
| [Command line](../packages/moon369) | `npx moon369 sign` / `verify` | `npm i -g moon369` |
| [Git](../actions/git-hook) | Signs every commit, receipts in git notes | One-line install |
| [GitHub Actions](../actions/sign) | Signs releases and their commit | `uses: moon369org/moon-369/actions/sign@main` |

No code: [moon369.org/sign](https://moon369.org/sign) signs any file, photo or text in one click.

These sign the *when* and the *exact bytes*. They don't write C2PA Content Credentials into files: for that, see
[moon369-capture](../packages/capture), which needs your own C2PA certificate.

Set `MOON_KEY` (free at [moon369.org/api#key](https://moon369.org/api#key)) to register work under your verified name
and lift the rate limit.
