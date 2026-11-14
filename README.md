# Moon

**The worldwide timestamp, locked to the moon.** 13 moons. 369 lunes. Open source.

Moon counts the year in 13 moons, each one a real lunar cycle, for exactly 369 lunes, and gives every moment one Moonmark, the same everywhere, with no time zones and no daylight saving. This repository holds the whole project: the website, the API and reference implementation, and the brand.

```
moon/
├── site/     The website: home, calendar, API docs and press kit. Static HTML, no build step.
├── api/      The Moon API (Vercel Function) and the reference implementation in TypeScript.
├── brand/    Logos, mark, app icons, badges, loader, colors and social images.
└── .github/  CI: tests the API on every push and pull request.
```

## The standard (v1)

| | |
|---|---|
| Moon second | 1.0403730490216803 SI seconds, exactly 33,168,757,399,689,600 / 31,881,600,000,000,000 |
| Minute / hour / day | 60 / 60 / 24 Moon units |
| Moon | 28.3846 lunes, one mean lunation (29.530588853 SI days) |
| Year | 13 moons, 369 lunes. Moon lengths 29, 28, 29, 28, 28, 29, 28, 29, 28, 28, 29, 28, 28 |
| Epoch | Year 0, Moon 1, Day 1, 00:00:00 = 0000-01-23 02:43:57.0214 UTC, the first mean new moon of 0 AD |
| Time base | Unix time (no leap seconds). No time zones. No daylight saving. |

Stamp format: `YEAR.MM.DD HH:MM:SS.NNNNNNNNN`, for example `1928.05.03 08:57:39.035909351`.

The full reference implementation is [`api/src/moon.ts`](api/src/moon.ts).

## Website (`site/`)

Plain HTML pages. Each page keeps its markup and logic in one file, rendered by a small runtime (`site/js/dc-lite.js`) on top of Preact (vendored, no install). Open `site/index.html` in a browser, or serve the folder:

```bash
npx serve site
```

Pages: `index.html` (home, live global clock, time zone map, FAQ), `calendar.html` (13-moon calendar and converter), `api.html` (API docs), `press.html` (press kit).

Before launch, fill in the bracketed placeholders: API base URL, rate limits, GitHub URL, press contact email and API terms.

## API (`api/`)

```bash
cd api
npm install
npm test        # 36 tests
npm run dev     # vercel dev, http://localhost:3000
```

See [`api/README.md`](api/README.md) for endpoints and deployment.

## Deploy

Both parts deploy to Vercel through its Git integration. Every push to `main` goes to production and every pull request gets a preview URL. No GitHub secrets are needed.

1. In Vercel, import this GitHub repo **twice**:
   - **moon** (the site): Root Directory `site`, Framework Preset "Other", no build command.
   - **moon-api** (the API): Root Directory `api`. `api/vercel.json` routes every path to the function.
2. Add your .org domain to the site project, and `api.[your domain].org` to the API project.
3. Push.


## How Moon evolves

Moon is an open standard, built in public. Anyone can propose a change as a Moon Improvement Proposal (MIP), and the version people actually use becomes the standard. See [`proposals/`](proposals/README.md).

## License

Code is MIT licensed (see `LICENSE`). The Moon name, the linked-O mark and the "Powered by Moon" badge are trademarks and are not covered by the MIT license; see the brand rules on the press and API pages.
