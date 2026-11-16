# Sign every commit on Moon (git hook)

A `post-commit` hook that has Moon sign each commit the moment you make it. Moon signs the SHA-256 of the
commit's exact git object, so only that fingerprint leaves your machine, and anyone with the repo can
recompute it. The signed receipt is kept in a git note (`refs/notes/moonmark`), alongside the code.

```sh
# in your repo (macOS, Linux, or Git Bash on Windows)
curl -fsSL https://raw.githubusercontent.com/moon369org/moon-369/main/actions/git-hook/install.sh | sh
```

Every commit then prints `moon: signed 1a2b3c4 at 1928.05.07 07:18:21`. The hook never blocks a commit: if Moon
can't be reached within 10 seconds, that commit simply isn't signed.

Set `MOON_KEY` to a [Moon API key](https://moon369.org/api#key) to register commits under your verified name.

## Share and check

```sh
git push origin refs/notes/moonmark           # publish the signatures with your code
sh moon-verify-commit <sha>                    # recompute the fingerprint, match the receipt, check Moon's signatures
```

`moon-verify-commit` prints `VALID: commit … existed at Moonmark …` or says exactly what doesn't match.
By hand: `git cat-file commit <sha> | sha256sum` must equal the `sha256` in `git notes --ref=moonmark show <sha>`.

To sign releases in CI instead, use the [GitHub Action](../sign) with `commit: true`.
