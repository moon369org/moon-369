#!/usr/bin/env bash
# Sign files on Moon: fingerprint each file here, send only the SHA-256, collect the receipts.
# Env: MOON_FILES (globs), MOON_KEY (optional), MOON_LABEL, MOON_OUT, MOON_API. Needs bash 4+, curl, jq.
set -euo pipefail
shopt -s globstar nullglob
API="${MOON_API:-https://api.moon369.org}"; OUT="${MOON_OUT:-moon-receipts.json}"; LABEL="${MOON_LABEL:-}"
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

files=()
for pat in ${MOON_FILES:-}; do for f in $pat; do [ -f "$f" ] && files+=("$f"); done; done
total=${#files[@]}; [ "${MOON_COMMIT:-false}" = "true" ] && total=$((total + 1))
if [ "$total" -eq 0 ]; then echo "::error::Nothing to sign. No files matched \"${MOON_FILES:-}\" and commit is off."; exit 1; fi
if [ -z "${MOON_KEY:-}" ] && [ "$total" -gt 5 ]; then
  echo "::error::$total items to sign. Without an API key Moon signs up to 5 a run. Add a free key as a secret: https://moon369.org/api#key"; exit 1
fi

items='[]'
# The commit itself: the SHA-256 of its exact git object, so anyone with the repo can recompute it:
#   git cat-file commit <sha> | sha256sum
if [ "${MOON_COMMIT:-false}" = "true" ]; then
  rev=$(git rev-parse "${MOON_REF:-HEAD}^{commit}")
  h=$(git cat-file commit "$rev" | { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; } | cut -d' ' -f1)
  lab="${LABEL:+$LABEL }commit $rev"
  items=$(jq -c --arg p "commit:$rev" --arg h "$h" --arg l "${lab:0:120}" '. + [{path: $p, sha256: $h, label: $l}]' <<<"$items")
fi
for f in "${files[@]}"; do
  h=$(sha "$f"); name="${f##*/}"; lab="${LABEL:+$LABEL }$name"
  items=$(jq -c --arg p "$f" --arg h "$h" --arg l "${lab:0:120}" '. + [{path: $p, sha256: $h, label: $l}]' <<<"$items")
done

auth=(); [ -n "${MOON_KEY:-}" ] && auth=(-H "Authorization: Bearer $MOON_KEY")
post() { curl -sS --fail-with-body -X POST "$API$1" -H 'Content-Type: application/json' "${auth[@]}" --data-binary @- ; }
results='[]'
n=$(jq length <<<"$items")
if [ -n "${MOON_KEY:-}" ]; then
  for ((i = 0; i < n; i += 100)); do
    chunk=$(jq -c --argjson i "$i" '.[$i:$i+100] | map({sha256, label})' <<<"$items")
    res=$(jq -c '{items: .}' <<<"$chunk" | post /v1/sign/batch) || { echo "::error::Moon: $res"; exit 1; }
    results=$(jq -c --argjson r "$(jq -c .results <<<"$res")" '. + $r' <<<"$results")
  done
else
  for ((i = 0; i < n; i++)); do
    one=$(jq -c --argjson i "$i" '.[$i] | {sha256, label}' <<<"$items")
    res=$(post /v1/sign <<<"$one") || { echo "::error::Moon: $res"; exit 1; }
    results=$(jq -c --argjson r "$res" '. + [$r]' <<<"$results")
  done
fi

jq -n --argjson items "$items" --argjson res "$results" --arg api "$API" '{
  moon: "moon-receipts/1", api: $api,
  files: [range(0; $items | length) as $i | {path: $items[$i].path, sha256: $items[$i].sha256, moonmark: $res[$i].receipt.moonmark,
          utc: $res[$i].utc, signed_url: $res[$i].signed_url, receipt: $res[$i].receipt}]
}' > "$OUT"

# sanity: every receipt covers its file's fingerprint
jq -e '[.files[] | .receipt.sha256 == .sha256] | all' "$OUT" >/dev/null || { echo "::error::A receipt does not match its file"; exit 1; }

count=$(jq '.files | length' "$OUT")
echo "Signed $count file(s) on Moon -> $OUT"
if [ -n "${GITHUB_OUTPUT:-}" ]; then { echo "receipts=$OUT"; echo "count=$count"; } >> "$GITHUB_OUTPUT"; fi
# A Markdown table of every proof, for the run summary and (optionally) the release notes.
table=$( { echo "### Signed on Moon"; echo; echo "| | Moonmark | Proof |"; echo "|---|---|---|"
  jq -r '.files[] | "| `\(.path)` | \(.moonmark[0:19]) | [check](\(.signed_url)) |"' "$OUT"
  echo; echo "Each fingerprint was signed by [Moon](https://moon369.org). Check a file at [moon369.org/verify](https://moon369.org/verify); check a commit with \`git cat-file commit <sha> | sha256sum\`."; } )
printf '%s\n' "$table" > "${OUT%.json}.md"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "notes=${OUT%.json}.md" >> "$GITHUB_OUTPUT"; fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$table" >> "$GITHUB_STEP_SUMMARY"; fi
