#!/bin/sh
# Every automated check, from the project root:  sh tools/check.sh
# The type-check needs mod/tsconfig.json, which Claude Code writes the first time it loads the mod
# (any `claude --plugin-dir ./mod` session); it downloads TypeScript through npx on first use.
set -e
cd "$(dirname "$0")/.."
echo "== content";        python3 rules/rpg.py validate   # every game in games/
echo "== python";         python3 -m py_compile rules/*.py && rm -rf rules/__pycache__ && echo "compiles"
echo "== rules: tests";   out=$(python3 tools/test_rules.py -q 2>&1) || { echo "$out"; exit 1; }; echo "$out" | tail -1
echo "== mod: validate";  claude plugin validate mod | grep -E "✔|✘"
echo "== mod: tests";     claude plugin test mod | tail -2
echo "== mod: types";     npx -y -p typescript@5.6.3 tsc -p mod && echo "types ok"
