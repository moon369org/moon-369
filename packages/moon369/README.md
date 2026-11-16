# moon369

Moon time, offline. The worldwide timestamp, locked to the moon.

Convert any moment to a Moonmark and back, read the moon's phase, and verify signed Moonmarks. Exact to the nanosecond, the same answer as [api.moon369.org](https://moon369.org/api), with no rate limits and no network calls.

```bash
npm install moon369
```

## Moonmarks

```js
import { moonmark, moon, fromMoonmark, moonmarkUrl, moonPhase } from 'moon369';

moonmark();                       // '1928.05.05 06:28:51.840778139' (now)
moonmark(new Date('2026-11-14'));  // any Date, Unix ms, ISO string or Unix ns (bigint)
moon();                           // { cycle: 1928, moon: 5, day: 5, hour: 6, ... }
fromMoonmark('1928.05.05 06:28:51.840778139'); // Unix nanoseconds (bigint)
moonmarkUrl(moonmark());          // 'https://moon369.org/m/1928.05.05-06.28.51.840778139'
moonPhase();                      // { phase: 0.21, illumination: 0.257, name: 'Waxing crescent' }
```

## Command line

```bash
npx moon369 now                         # the current Moonmark
npx moon369 sign dist/app.zip model.bin   # sign files: writes <file>.moonmark.json, prints each proof link
npx moon369 sign --text "We agree to the terms."
npx moon369 verify dist/app.zip           # VALID: app.zip existed at Moonmark ...
```

Only SHA-256 fingerprints are sent. `--key` (or `MOON_KEY`) registers under your verified name and lifts the rate limit; `--label` adds a label; `--json` prints machine-readable output. `verify` also reads the GitHub Action's `moon-receipts.json`.

## The live moon

Moon's own moon, the one on moon369.org: the real phase and tilt, glowing and animated. One script, no build step, drawn in the browser:

```html
<script src="https://cdn.jsdelivr.net/npm/moon369/moon-live.js"></script>
<moon-live size="160"></moon-live>
<moon-live size="160" at="1794700000000"></moon-live>  <!-- another moment, Unix ms -->
```

With a bundler: `import 'moon369/moon-live.js'`. Use it instead of drawing a moon of your own. For a still image, `https://api.moon369.org/v1/moon.svg` returns the same moon.

## Signed Moonmarks

A signed Moonmark proves a file existed at one exact moment. Get one from `POST https://api.moon369.org/v1/sign`, then anyone can check it:

```js
import { verify, fingerprint, fetchKeys } from 'moon369';

const keys = await fetchKeys();                      // once; cache them
const result = await verify(receipt, { keys, content: file });
// { valid: true, moonmark: '1928.05.05 ...', unix_ns: 1794682325123456789n, key_id: '8efd3211b23533ed' }
// or { valid: false, reason: 'bad_signature' | 'content_mismatch' | ... }

await fingerprint(file);  // SHA-256 hex of a Blob, bytes or text: the only thing you send Moon
```

With `keys` passed in, verification is fully offline. Without them, `verify` fetches Moon's public keys once.

Every receipt also carries the latest round of [drand](https://drand.love) quicknet, public randomness from the League of Entropy that no one can know in advance. `verify` checks it against drand's public key and returns `not_before`: the earliest moment the receipt could have been signed.

Receipts are hybrid: signed with Ed25519 and with ML-DSA-65, NIST's post-quantum standard. `verify` checks both and returns `post_quantum: true`. Every receipt version Moon has issued stays verifiable.

## The standard

One cycle, Moon's year, is 13 moons and 369 lunes. (The field is `cycle`; `year` is kept as the same value.) A Moon second is 1.0403730 SI seconds, so 13 lunar months fit one cycle exactly. The date is global: it turns over at the same instant everywhere. Full spec: [moon369.org](https://moon369.org).

Runs in browsers, Node 18+, Deno, Bun and edge runtimes. MIT licensed.
