# moon369-capture

Sign photos and video **at the moment of capture**, so anyone can later tell a real capture from a fake.

`capture()` takes a freshly captured file and, on your server:

1. **Signs it on Moon.** Moon signs the file's SHA-256 with a Moonmark: the exact moment, with Moon's Ed25519 and post-quantum ML-DSA signatures, registered under your app's name.
2. **Writes C2PA Content Credentials into the file.** The credentials say which app made it and how ("a digital capture"), and carry the Moonmark receipt inside as the assertion `org.moon369.moonmark`.
3. **Has Moon timestamp the credentials.** Moon's RFC 3161 Time-Stamp Authority timestamps the credentials' signature, so any C2PA tool shows *timestamp matched: Moon Timestamp Authority*.

`verify()` reads it all back from any copy of the file. So does [moon369.org/check](https://moon369.org/check): drop a file and see its credentials, how it was made, and Moon's proof.

```sh
npm install moon369-capture sharp
```

`sharp` is optional. With it, images also get Moon's look-alike hash, so cropped, resized or recompressed copies can be traced back to the original capture.

## Capture

```js
import { capture } from 'moon369-capture';
import { readFile, writeFile } from 'node:fs/promises';

const shot = await readFile('IMG_0042.jpg');            // straight from the camera
const out = await capture(shot, {
  mimeType: 'image/jpeg',
  moonKey: process.env.MOON_KEY,                         // registers it under your verified name
  signer: {
    certChainPem: await readFile('c2pa-chain.pem'),      // your C2PA claim signing certificate chain
    privateKeyPem: await readFile('c2pa-key.pem'),       // or sign: async (bytes) => yourHsm.sign(bytes)
    alg: 'es256',
  },
  app: { name: 'Lumen Camera', version: '2.1' },
  label: 'IMG_0042.jpg',
  onBehalfOf: 'Ana Ruiz',                                // the photographer, as you state it
});

await writeFile('IMG_0042.jpg', out.bytes);              // the file, now with Content Credentials
console.log(out.moonmark, out.signedUrl);                // 1928.05.06 10:43:17.958952179  https://moon369.org/m/…
```

## Verify

```js
import { verify } from 'moon369-capture';

const report = await verify(await readFile('IMG_0042.jpg'), { mimeType: 'image/jpeg' });
report.summary;
// "Content Credentials check out: a camera capture from Lumen Camera.
//  Signed on Moon at 1928.05.06 10:43:17.958952179, registered by Lumen Camera (verified). Timestamped by Moon."
```

`report.credentials.valid` is false if a single byte of the picture changed after signing.
`report.credentials.trusted` is true only for certificates on the C2PA Trust List.

## Browser camera apps

Capture in the browser, sign on your server. Your C2PA private key and your Moon key must never be in a browser:
send the shot to your own endpoint, call `capture()` there, and return `out.bytes`.

## What you need

- **A C2PA claim signing certificate.** C2PA Content Credentials are signed with *your* certificate. For credentials
  that validators trust, it must come from a CA on the [C2PA Trust List](https://c2pa.org/conformance), which requires
  the C2PA Conformance Program. Any certificate works for development; validators then say "untrusted".
- **A Moon API key** ([get one free](https://moon369.org/api#key)). For your company name to show as verified, email
  moon369org@proton.me.

## Honest by design

- Generated or AI-edited media can be signed too: set `sourceType: SOURCE.ai` or `SOURCE.aiEdited`. Content
  Credentials record how something was made; they only help if apps say so truthfully.
- Moon proves **when** a file existed and **who registered it**. It never claims a picture is "true". Signing at the
  shutter, by a verified camera app, is the strongest evidence a picture is a real capture.
- If someone strips the credentials, the original capture is still registered on Moon, and the look-alike hash finds
  edited copies of it.

## How the pieces fit

| Layer | What it proves | Checked by |
|---|---|---|
| C2PA claim signature | This app made this exact file, unchanged since | Any C2PA tool |
| Moon RFC 3161 timestamp | The credentials existed at this time | Any C2PA tool |
| `org.moon369.moonmark` receipt | Moon signed the capture's fingerprint at this Moonmark | `verify()`, moon369.org/check, the `moon369` package |
| Moon registry + Tideline | Who registered it, in Moon's public, append-only log | moon369.org/tideline |

MIT licensed.
