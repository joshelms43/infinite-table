#!/usr/bin/env bash
# ship — run the gate, and push ONLY if every stage passed.
#
# Why this exists: the push has always been guarded by discipline, typed fresh each time
# as `npm run check && commit && push`. On 2026-07-27 that discipline was written as
#     npm run check > log && echo GREEN || echo RED
# followed by an unconditional push. The `||` swallowed the failing exit code, the word
# RED was printed, and the push went out anyway over a red gate. The stage that failed
# was a known flake in another game and main turned out fine — but the contract had been
# broken by a shell operator, which is exactly the kind of failure that should not depend
# on remembering. The rule is now mechanical.
#
# Usage:  tools/ship.sh "commit message"
#         tools/ship.sh "commit message" --retry-flaky
#
# --retry-flaky re-runs the gate once if it fails, because the drag-choreography stages
# are timing-sensitive under container load. A second failure is a real failure: a stage
# that fails twice in a row blocks the ship, no matter which game it belongs to.

set -euo pipefail

MSG="${1:-}"
RETRY="${2:-}"
if [ -z "$MSG" ]; then
  echo "ship: refusing — no commit message" >&2
  exit 2
fi

cd "$(dirname "$0")/.."

if [ -z "${IT_TOKEN:-}" ]; then
  echo "ship: refusing — IT_TOKEN is not set" >&2
  exit 2
fi

REMOTE="https://x-access-token:${IT_TOKEN}@github.com/joshelms43/infinite-table.git"

run_gate() {
  npm run check > /tmp/ship-gate.log 2>&1
}

echo "ship: running the gate…"
if ! run_gate; then
  if [ "$RETRY" = "--retry-flaky" ]; then
    echo "ship: gate failed — retrying once (timing-sensitive stages)…" >&2
    grep -E "^FAIL|FAILURES" /tmp/ship-gate.log | head -5 >&2 || true
    if ! run_gate; then
      echo "ship: BLOCKED — the gate failed twice. Nothing was pushed." >&2
      grep -E "^FAIL|FAILURES" /tmp/ship-gate.log | head -10 >&2 || true
      exit 1
    fi
  else
    echo "ship: BLOCKED — the gate is red. Nothing was pushed." >&2
    grep -E "^FAIL|FAILURES" /tmp/ship-gate.log | head -10 >&2 || true
    exit 1
  fi
fi

PASSES=$(grep -cE "^PASS" /tmp/ship-gate.log || true)
echo "ship: gate green ($PASSES assertions)."

if [ -z "$(git status --porcelain)" ]; then
  echo "ship: nothing to commit."
  exit 0
fi

git add -A
git commit -qm "$MSG"
git pull -q --rebase "$REMOTE" main
git push -q "$REMOTE" main
echo "ship: pushed $(git rev-parse --short HEAD)"
