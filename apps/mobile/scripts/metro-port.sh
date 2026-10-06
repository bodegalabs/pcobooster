#!/usr/bin/env bash
# Prints the Metro port for this checkout: METRO_PORT when set, 8081 in the main checkout, and a
# port from 8100 to 8899 derived from the path in a linked worktree, so worktrees can run Metro
# (and builds that load JavaScript from it) at the same time.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "${METRO_PORT:-}" ]; then
  echo "$METRO_PORT"
elif [ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ]; then
  echo 8081
else
  echo $((8100 + $(git rev-parse --show-toplevel | cksum | cut -d' ' -f1) % 800))
fi
