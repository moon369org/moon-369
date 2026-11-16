# Signed audit trail

Tamper-evident logs with two small scripts and no dependencies (Node 18+).

```sh
your-app | node chain.mjs --out audit.jsonl --every 60      # chain every line, sign the head every minute
node verify.mjs audit.jsonl                                 # check every line and every seal
```

- Each line is stored with `hash = SHA-256(prev + "\n" + line)`, so changing, removing or reordering one line breaks every hash after it.
- Every minute the newest hash is signed on Moon. A seal proves every line up to it existed by then, with Moon's Ed25519 + ML-DSA-65 signatures and a public drand beacon.
- Only the 64-character hash is sent to Moon, never a log line. Add `--key $MOON_KEY` (free at moon369.org/api#key) for more than a few seals a minute across servers.
