# Changelog

## 1.0.0 (Moon 05, Day 04, Year 1928)

The first stable version. From here, v1 only gets additions, never breaking changes.

- **Moon**: the engine and the calendar. 369 Moon days in a year, 13 moons of 28 or 29 days, locked to the real moon.
- **Moonmark**: one exact moment, `YEAR.MM.DD HH:MM:SS.NNNNNNNNN`, with `moonmark_url` (`https://moon369.org/m/...`) for links and QR codes. `/v1/moonmark`, `/v1/m/{moonmark}`.
- **Light and Dark**: counters from first light and sunset in Moon seconds, needing only `lat` and `lon`. `/v1/light`, `light` on `/v1/now`, `/v1/convert` and `/v1/m/{moonmark}`, and `/v1/schedule?light=06:45`.
- **Seasons**: `/v1/seasons/{year}`.
- **Open tier**: 120 requests a minute per IP, `429` with `Retry-After` past that.
- **Deprecated**: `/v1/sun` (old local clock) still works and returns a `Deprecation` header pointing to `/v1/light`. `/v1/stamp` still works as the old name of `/v1/moonmark`.
