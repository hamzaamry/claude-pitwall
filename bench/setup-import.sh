#!/usr/bin/env bash
# Creates one clean benchmark folder for Hevier issue #24 (CSV import fix).
# The folder is a fresh git repo with ONE commit (the code before the fix), so the run
# cannot find the real fix in the git history.
# usage: bench/setup-import.sh <run-name>      e.g. A1, B1
set -euo pipefail
name="${1:?usage: setup-import.sh <run-name>}"
hevier="${HEVIER:-$HOME/Hevier}"
base=e1fb0ca^   # parent of "fix(import): handle lbs and bad rows (#24)"
dir="$HOME/pitwall-bench/$name"

[ -e "$dir" ] && { echo "$dir already exists"; exit 1; }
mkdir -p "$dir"
git -C "$hevier" archive "$base" | tar -x -C "$dir"
cd "$dir"
git init -q
git add -A
git -c user.name=bench -c user.email=bench@localhost commit -qm "base: before the import fix"
# deps from the main Hevier checkout (verified: tsx via npx, sql.js, vitest and tsc all resolve)
ln -s "$hevier/apps/mobile/node_modules" node_modules
echo "ready: $dir"
