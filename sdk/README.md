# Moon SDKs

Moon time and signed Moonmarks in every language, with the same answers to the nanosecond and offline
verification of Moon's receipts (Ed25519, post-quantum ML-DSA-65 and the public drand beacon).

| Language | Install | Source |
|---|---|---|
| JavaScript / TypeScript | `npm install moon369` | [packages/moon369](../packages/moon369) |
| Python | `pip install moon369` | [python](python) |
| Go | `go get github.com/moon369org/moon-369/sdk/go` | [go](go) |
| Rust | `cargo add moon369` | [rust](rust) |

Each SDK does the same four things: Moon time for any moment (`moonmark`), a Moonmark back to Unix nanoseconds,
the Moonmark's link, and `verify(receipt, keys)` with the same result reasons as the npm package. Signing happens on
Moon's API (`POST https://api.moon369.org/v1/sign` with a SHA-256); checking never needs Moon.

## Conformance

`vectors.json` holds the shared test vectors: Moon time conversions, valid v1, v2 and v3 receipts (with a real
drand quicknet beacon and an ML-DSA-65 signature), and one invalid receipt for every failure reason. Every SDK's
tests load this file, and CI runs them all. A new SDK is done when it passes every vector.

`make-vectors.ts` regenerates the file with fresh test keys (`npx tsx sdk/make-vectors.ts` from `api/`), and
`check-vectors-ts.mjs` checks it against the npm package.
