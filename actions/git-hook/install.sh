#!/bin/sh
# Install Moon commit signing in the current git repo, and share the signatures when you push.
#   curl -fsSL https://raw.githubusercontent.com/moon369org/moon-369/main/actions/git-hook/install.sh | sh
set -e
top=$(git rev-parse --show-toplevel)
hooks=$(git rev-parse --git-path hooks)
base="https://raw.githubusercontent.com/moon369org/moon-369/main/actions/git-hook"
mkdir -p "$hooks"
if [ -e "$hooks/post-commit" ] && ! grep -q "Moon: sign every commit" "$hooks/post-commit"; then
  echo "A post-commit hook already exists at $hooks/post-commit. Add Moon's by hand: $base/post-commit"; exit 1
fi
curl -fsSL "$base/post-commit" -o "$hooks/post-commit" && chmod +x "$hooks/post-commit"
# Fetch other people's signatures with the code. (Share yours with: git push origin refs/notes/moonmark)
git config --get-all remote.origin.fetch 2>/dev/null | grep -q 'refs/notes/moonmark' || git config --add remote.origin.fetch '+refs/notes/moonmark:refs/notes/moonmark' 2>/dev/null || true
echo "Moon will sign every commit in $top."
echo "Share signatures: git push origin refs/notes/moonmark   Check a commit: sh moon-verify-commit <sha> ($base/moon-verify-commit)"
