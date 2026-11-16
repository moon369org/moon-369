# Sign files on Moon (GitHub Action)

Timestamps your release files with signed Moonmarks (Ed25519 + ML-DSA-65, with a public drand beacon).
Only each file's SHA-256 fingerprint leaves the runner. Anyone can check a file later at
[moon369.org/check](https://moon369.org/check), or offline with the receipt.

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
          upload-to-release: true
```

| Input | Default | |
|---|---|---|
| `files` | (required) | Files or globs, space or newline separated (`**` works) |
| `api-key` | none | Without a key Moon signs up to 5 files a run; with one, 100 per call |
| `label` | none | Stored with each registration, before the file name |
| `output` | `moon-receipts.json` | Receipts for every file: path, SHA-256, Moonmark, link, full receipt |
| `upload-to-release` | `false` | Attach the receipts to the release (needs `contents: write`) |

Outputs: `receipts` (the file's path) and `count`. The run's summary lists every file with a link to its proof.
