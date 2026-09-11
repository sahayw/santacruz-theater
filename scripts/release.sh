#!/bin/bash
# Sync, then promote dev to production.
#
#   1. Run sync-branches.sh: fast-forward local main + dev to origin and merge
#      main into dev (pulls in any data edits committed by the live /admin editor).
#   2. Show the commits on dev that main doesn't have, and confirm.
#   3. Merge dev into main and push — Netlify deploys from main.
#   4. Back-merge main into dev and push, so the branches stay consistent.
#
# Leaves the ics branch untouched. Run `npm run sync` on its own at the start of
# a feature branch; `npm run release` when the work on dev is ready to ship.
#
# Usage: npm run release [-- -y]
#   -y / --yes   skip the confirmation prompt
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

assume_yes=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) assume_yes=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

original_branch="$(git rev-parse --abbrev-ref HEAD)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean; aborting." >&2
  exit 1
fi

echo "=== Syncing branches with origin ==="
bash "$repo_root/scripts/sync-branches.sh"

pending="$(git log --oneline main..dev)"
if [[ -z "$pending" ]]; then
  echo "Nothing to release — dev has no commits beyond main."
  exit 0
fi

echo
echo "=== Commits that will be released to main ==="
echo "$pending"
echo

if [[ "$assume_yes" != true ]]; then
  read -r -p "Merge dev into main and push (triggers production deploy)? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "=== Merging dev into main ==="
git checkout main
if ! git merge --no-ff dev -m "Release: merge dev into main"; then
  echo "Merge conflict merging dev into main; resolve manually, commit, and push main." >&2
  exit 1
fi
git push origin main

echo "=== Back-merging main into dev ==="
git checkout dev
if ! git merge main -m "Merge main into dev"; then
  echo "Merge conflict merging main into dev; resolve manually, commit, and push dev." >&2
  exit 1
fi
git push origin dev

git checkout "$original_branch"
echo "=== Done. main pushed — Netlify will deploy. Back on $original_branch ==="
