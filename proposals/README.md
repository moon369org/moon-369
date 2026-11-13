# Moon Improvement Proposals (MIPs)

Moon is an open standard, built in public. Anyone can propose a change, and the version people actually use becomes the standard.

## How it works

1. **Propose.** Copy `0000-template.md` to `proposals/0000-short-title.md`, fill it in, and open a pull request. You can also start with an issue if you only have an idea.
2. **Discuss.** Every proposal is debated in the open on its pull request. Show the math, the tradeoffs and who it helps.
3. **Number.** A proposal that is complete and clearly written gets a number and is merged as `Draft`. Merging means it is on the record, not that it is adopted.
4. **Adopt.** A proposal becomes `Adopted` when it is implemented in the reference code and people build on it. Changes that would break existing apps ship as a new version (v2, v3, ...) beside the old one, never in place of it.

## Status

| Status | Meaning |
|---|---|
| Draft | Written up and open for discussion |
| Adopted | Part of the standard in a named version |
| Withdrawn | Closed by the author |
| Rejected | Closed after discussion, with the reasons recorded |

## Principles

- Moon v1 never breaks. Anything that changes an existing result ships as a new version.
- Proposals must show their math. Every number in the standard has to be reproducible.
- 369 lunes, 13 moons and the Moon second are the core of v1. Proposals can challenge them, but must say what a new version would change for people already using v1.

## Index

| MIP | Title | Status |
|---|---|---|
| 0001 | The lune: naming the Moon day | Adopted (v1) |
