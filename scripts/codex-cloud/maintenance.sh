#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

cd "$REPOSITORY_ROOT"
codex_cloud_bootstrap
LEFTHOOK=0 bun install --frozen-lockfile

printf 'Codex cloud maintenance complete.\n'
