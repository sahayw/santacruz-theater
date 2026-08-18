#!/bin/bash
# Sync local main and dev branches with origin (fast-forward only), then merge main into dev
# to keep dev current with production data. Leaves ics branch untouched. dev is never merged
# into main by this script (dev may contain unfinished feature work).
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

original_branch="$(git rev-parse --abbrev-ref HEAD)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean; aborting." >&2
  exit 1
fi

git fetch origin main dev

for branch in main dev; do
  echo "=== Syncing $branch with origin/$branch ==="
  git checkout "$branch"
  git merge --ff-only "origin/$branch"
  git push origin "$branch"
done

echo "=== Merging main into dev ==="
git checkout dev
if ! git merge main -m "Merge main into dev"; then
  echo "Merge conflict merging main into dev; resolve manually, then commit and push dev." >&2
  exit 1
fi
git push origin dev

git checkout "$original_branch"
echo "=== Done. Back on $original_branch ==="
