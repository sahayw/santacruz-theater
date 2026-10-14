#!/bin/bash
# Sync local main and dev with origin, then merge main into dev so dev picks up the data
# edits the live /admin editor commits to main.
#
#   1. Fetch main and dev from origin.
#   2. For main, then dev: fast-forward to origin (fails rather than merge if the local
#      branch has diverged), and push any local commits.
#   3. Merge main into dev and push dev.
#   4. Return to the branch you started on.
#
# Only main and dev are touched; other branches are left alone. dev is never merged into
# main here (it may hold unfinished feature work) — that's `npm run release`.
# Run `npm run sync` at the start of a feature branch.
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
