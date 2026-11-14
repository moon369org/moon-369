# Changelog

## 1.4.0 (Moon 05, Lune 05, Year 1928)

- **Receipts v2 (`moonmark-receipt/2`)**: every signed Moonmark now includes the latest drand quicknet round (public randomness from the League of Entropy, a new value every 3 seconds). It can't be known in advance, so the receipt provably wasn't signed before it. The beacon is part of the signed bytes and is checked against drand's public key, offline.
- **`/v1/verify`** returns `not_before` (UTC, Unix ns, round) for v2 receipts. v1 receipts still verify.
- **Signed links** carry the beacon (`r` and `b`), and the Moonmark page shows NOT BEFORE.

## 1.3.0 (Moon 05, Lune 05, Year 1928)

- **API keys**: customers send `Authorization: Bearer <key>` for their own per-minute limit. Keys are stored only as SHA-256 hashes. A switched-off key gets `403 key_disabled`.
- **`GET /v1/me`**: shows your plan and limit.

## 1.2.0 (Moon 05, Lune 05, Year 1928)

- **Illumination**: `phase.illumination` now uses the moon's true phase angle (latitude and distances, Meeus ch. 47-48) and matches PyEphem within 0.05 percentage points across 2000-2050, up from 0.25. `/v1/spec` documents the method under `illumination`.
- **Share images**: `GET /v1/card.png` renders a 1200×630 PNG for any Moonmark. Every moon369.org/m/ link now shows its own card when shared.
- **Card image**: `GET /v1/card.svg` returns the Today on Moon card as an SVG, live or for any moment, embeddable with one img tag.

- **Signed Moonmarks**: `POST /v1/sign` signs a SHA-256 fingerprint at the current moment and returns an Ed25519 receipt. `POST /v1/verify` checks one, and `GET /v1/keys` publishes the public keys so anyone can verify offline. Content never leaves the caller: only the fingerprint is sent.

## 1.1.0 (Moon 05, Lune 04, Year 1928)

Moon is now one thing: the worldwide timestamp, locked to the moon.

- **Removed**: `/v1/light`, `/v1/schedule`, `/v1/sun`, `/v1/seasons/{year}`, and the `tz`, `lat`, `lon` and `sun` parameters. Light, Dark and the sun layer were never announced; they can return through the proposals process.
- **Lune**: the Moon day is called a lune. Field names are unchanged.

## 1.0.0 (Moon 05, Day 04, Year 1928)

The first stable version. From here, v1 only gets additions, never breaking changes.

- **Moon**: the engine and the calendar. 369 lunes in a year, 13 moons of 28 or 29 lunes, locked to the real moon.
- **Moonmark**: one exact moment, `YEAR.MM.DD HH:MM:SS.NNNNNNNNN`, with `moonmark_url` (`https://moon369.org/m/...`) for links and QR codes. `/v1/moonmark`, `/v1/m/{moonmark}`.
- **Light and Dark**: counters from first light and sunset in Moon seconds, needing only `lat` and `lon`. `/v1/light`, `light` on `/v1/now`, `/v1/convert` and `/v1/m/{moonmark}`, and `/v1/schedule?light=06:45`.
- **Seasons**: `/v1/seasons/{year}`.
- **Open tier**: 120 requests a minute per IP, `429` with `Retry-After` past that.
- **Deprecated**: `/v1/sun` (old local clock) still works and returns a `Deprecation` header pointing to `/v1/light`. `/v1/stamp` still works as the old name of `/v1/moonmark`.
