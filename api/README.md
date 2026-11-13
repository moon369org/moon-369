# Moon API

The open standard for time. One engine, two layers:

- **Moon** is the engine and the calendar: one continuous count underneath everything, read as the date, 13 moons, 369 days and the real moon's phase.
- **Moonmark** is one exact moment on that engine, the same everywhere: `1928.05.03 09:12:04.205379905`. For events, records and systems.
- **Light and Dark** is how people live the day. The Light counter starts at 00:00:00 at first light and runs to sunset, then Dark runs to the next first light. Light and Dark never change the date: the Moon date is global and changes at the same instant everywhere. It only needs where you stand, never a time zone.

Hosted at `https://api.moon369.org`. This repo is the hosted API (a Vercel Function) and the reference implementation of the standard.

- `src/moon.ts`: the whole standard. Exact conversions in whole nanoseconds (BigInt), no floating point.
- `src/light.ts`: Light and Dark counters, and the polar fallback.
- `src/sun.ts`: Sun, the local layer: local clock, sunrise, sunset, seasons and the local Moon date.
- `src/index.ts`: the API: routing, rate limits, optional keys, caching, CORS.
- `api/index.ts` + `vercel.json`: the Vercel Function entry; every path is rewritten to it.
- `openapi.yaml`: the API contract.
- `test/`: 64 tests covering the constants, conversions in both directions, boundaries and every route.

## Endpoints

| Route | What it returns |
|---|---|
| `GET /v1/now` | Current Moon date, Moonmark and phase |
| `GET /v1/moonmark?unix_ns=` | A Moonmark with `accuracy_ns`, `clock` and a link for QR codes (`/v1/stamp` still works) |
| `GET /v1/m/{moonmark}` | Open a Moonmark link, `YEAR.MM.DD-HH.MM.SS.fraction` |
| `GET /v1/convert?unix=` / `unix_ns=` / `utc=` | Standard time to Moon time (`&format=string` for plain text) |
| `GET /v1/to-unix?moonmark=` or `year=&moon=&day=&time=` | Moon time to standard time |
| `GET /v1/year/{year}` | The 13 moons of a year, their lengths and UTC starts |
| `GET /v1/light?lat=&lon=` | Light and Dark: the counter, what remains, and when this day's light began |
| `GET /v1/sun` | Sun, the local layer: local clock, sunrise, solar noon, sunset, day length and season (`tz`, `lat`, `lon`, `date`) |
| `GET /v1/schedule?light=06:45&lat=&lon=` | Repeat a Light or Dark reading every day, each with its Moonmark |
| `GET /v1/seasons/{year}` | Equinoxes and solstices inside a Moon year, in Moon time |

`/v1/now` and `/v1/convert` also take `tz`, `lat` and `lon` to add a `sun` object, and `/v1/convert` accepts `sun=YYYY-MM-DDTHH:MM&tz=...` to turn a local time into Moon time. Moon has no time zones; they live only in Sun.
| `GET /v1/spec` | Every constant, including the exact Moon second ratio |

No key needed. Send `Authorization: Bearer <key>` for the higher keyed limit.

## Run it

```bash
npm install
npm test          # 36 tests
npm run dev       # vercel dev, local server at http://localhost:3000
```

## Deploy

1. In Vercel, import the GitHub repo as a new project with Root Directory `api`.
2. Add the domain `api.[your domain].org` to the project.
3. Push to `main`. Vercel deploys production; pull requests get preview URLs.

Optional environment variables: `CLOCK_ACCURACY_NS` (default `1000000`) and `CLOCK_SOURCE` (default `server-ntp`).

Rate limits and API keys: the router supports an open per-IP limit, a keyed limit and a key store (`RATE_LIMITER`, `RATE_LIMITER_KEYED`, `API_KEYS` in `src/index.ts`), but none are wired up on Vercel yet, so the deployment has no limit and rejects keys with `keys_disabled`. Use a Vercel Firewall rate-limit rule for the open tier, or back them with Upstash Redis.

## The standard (v1)

| | |
|---|---|
| Moon second | 1.0403730490216803 SI seconds, exactly 33,168,757,399,689,600 / 31,881,600,000,000,000 |
| Minute / hour / day | 60 / 60 / 24 Moon units |
| Moon | 28.3846 Moon days, one mean lunation (29.530588853 SI days) |
| Year | 13 moons, 369 Moon days. Moon lengths 29, 28, 29, 28, 28, 29, 28, 29, 28, 28, 29, 28, 28 |
| Epoch | Year 0, Moon 1, Day 1, 00:00:00 = 0000-01-23 02:43:57.0214 UTC, the first mean new moon of 0 AD, 24,736 lunations before the reference new moon of 2000-01-06 18:14 UTC |
| Time base | Unix time (no leap seconds). No time zones. No daylight saving. |

Moonmark format: `YEAR.MM.DD HH:MM:SS.NNNNNNNNN`, for example `1928.05.03 08:57:39.035909351`.

## Accuracy

Moonmarks carry 9 decimal places. Accuracy depends on the clock that produced the instant: the server exposes millisecond time, so server Moonmarks report `accuracy_ns: 1000000`. When you pass your own `unix_ns`, the Moonmark is exact and `accuracy_ns` is `null`.

## License

Code: MIT. The Moon name, mark and badge are trademarks; see the brand rules in the docs.

## Deploying

- Domain: `api.moon369.org`. Moonmark links point to `https://moon369.org/m/{moonmark}`.
- Rate limit: 120 requests a minute per IP by default (`RATE_LIMIT_PER_MIN`). Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` so the limit is shared across every server instance; without them each instance limits on its own.
- Privacy: requests and locations are not logged or stored by the API.

## Higher limits

The open API allows 120 requests a minute per IP. Need more for a larger project? Email moon369org@proton.me.
