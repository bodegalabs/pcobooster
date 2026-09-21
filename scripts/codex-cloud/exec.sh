#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly STATE_PATH="${CODEX_CLOUD_STATE_PATH:-${REPOSITORY_ROOT}/.codex-cloud/session.json}"

if (($# == 0)); then
  printf 'Usage: %s <command> [arguments...]\n' "$0" >&2
  exit 64
fi

if [[ -f "$STATE_PATH" ]]; then
  DATABASE_URL="$(jq --exit-status --raw-output '.databaseUrl' "$STATE_PATH")"
  export DATABASE_URL
fi

exec "$@"
