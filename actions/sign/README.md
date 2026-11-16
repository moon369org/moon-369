# Sign files on Moon (GitHub Action)

Timestamps your release files with signed Moonmarks (Ed25519 + ML-DSA-65, with a public drand beacon).
Only each file's SHA-256 fingerprint leaves the runner. Anyone can check a file later at
[moon369.org/verify](https://moon369.org/verify), or offline with the receipt.

```yaml
on:
  release:
    types: [published]
permissions:
  contents: write          # only needed for upload-to-release
jobs:
  sign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make dist                     # build your release files
      - uses: moon369org/moon-369/actions/sign@main
        with:
          files: dist/*
          api-key: ${{ secrets.MOON_KEY }}  # optional: free key at moon369.org/api#key
          label: ${{ github.event.release.tag_name }}
          commit: true                      # also sign the release commit itself
          upload-to-release: true
          release-notes: true               # add a "Signed on Moon" table to the release notes
```

| Input | Default | |
|---|---|---|
| `files` | none | Files or globs, space or newline separated (`**` works). Optional when `commit` is on |
| `commit` | `false` | Also sign the commit: the SHA-256 of its git object, so anyone with the repo can recompute it |
| `ref` | `HEAD` | Which commit to sign |
| `release-notes` | `false` | Append a table with a proof link per file to the release notes (release events, `contents: write`) |
| `api-key` | none | Without a key Moon signs up to 5 files a run; with one, 100 per call |
| `label` | none | Stored with each registration, before the file name |
| `output` | `moon-receipts.json` | Receipts for every file: path, SHA-256, Moonmark, link, full receipt |
| `upload-to-release` | `false` | Attach the receipts to the release (needs `contents: write`) |

Outputs: `receipts` (the file's path), `count`, and `notes` (a Markdown table of every proof, for release notes or a PR comment). The run's summary lists every file with a link to its proof.

## Check a signed commit

```sh
git cat-file commit <sha> | sha256sum      # must equal the receipt's sha256
```

Then check the receipt itself at [moon369.org/verify](https://moon369.org/verify), with `POST https://api.moon369.org/v1/verify`, or offline with the `moon369` npm package. To sign every commit as it's made, see [the git hook](../git-hook).
