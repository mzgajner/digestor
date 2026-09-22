#!/usr/bin/env bash
# Commits the given paths as the Actions bot and pushes them to main.
# Usage: commit-and-push.sh <message> <path>...
#
# Writes pushed=true|false to $GITHUB_OUTPUT. If main moved in the meantime it
# rebases and retries; a real conflict fails the job, which is fine because the
# workspace is thrown away and the next run starts from the new main.
set -euo pipefail

message=$1
shift

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

git add -- "$@"
if git diff --cached --quiet; then
  echo 'Nothing to commit.'
  echo 'pushed=false' >> "$GITHUB_OUTPUT"
  exit 0
fi

git commit -m "$message"

for attempt in 1 2 3; do
  if git push origin HEAD:main; then
    echo 'pushed=true' >> "$GITHUB_OUTPUT"
    exit 0
  fi
  echo "Push attempt $attempt failed, rebasing onto the new main."
  git pull --rebase --autostash origin main
done

echo 'Could not push after 3 attempts.'
exit 1
