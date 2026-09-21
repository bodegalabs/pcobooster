#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly STATE_PATH="${CODEX_CLOUD_STATE_PATH:-${REPOSITORY_ROOT}/.codex-cloud/session.json}"
readonly NEON_API_ORIGIN="${NEON_API_ORIGIN:-https://console.neon.tech/api/v2}"

if [[ ! -f "$STATE_PATH" ]]; then
  printf 'No Codex cloud database session is recorded.\n'
  exit 0
fi

: "${NEON_API_KEY:?Add NEON_API_KEY to Infisical Development /cloud.}"
: "${NEON_PROJECT_ID:?Add NEON_PROJECT_ID to Infisical Development /cloud.}"

branch_id="$(jq --exit-status --raw-output '.branchId' "$STATE_PATH")"
branch_name="$(jq --exit-status --raw-output '.branchName' "$STATE_PATH")"
cleanup_after="$(jq --exit-status --raw-output '.cleanupAfter' "$STATE_PATH")"
neon_expiry_enabled="$(jq --raw-output '.neonExpiryEnabled' "$STATE_PATH")"
state_project_id="$(jq --exit-status --raw-output '.projectId' "$STATE_PATH")"

if [[ "$state_project_id" != "$NEON_PROJECT_ID" ]]; then
  printf 'Recorded Neon project %s does not match configured project %s.\n' \
    "$state_project_id" "$NEON_PROJECT_ID" >&2
  exit 1
fi

http_status="$(curl \
  --silent \
  --output /dev/null \
  --write-out '%{http_code}' \
  --header "Authorization: Bearer ${NEON_API_KEY}" \
  "${NEON_API_ORIGIN}/projects/${NEON_PROJECT_ID}/branches/${branch_id}")"

case "$http_status" in
  200)
    if [[ "$neon_expiry_enabled" == "true" ]]; then
      printf 'Codex cloud database branch %s (%s) is active; Neon expiry is %s.\n' \
        "$branch_name" "$branch_id" "$cleanup_after"
    else
      printf 'Codex cloud database branch %s (%s) is active; cleanup deadline is %s.\n' \
        "$branch_name" "$branch_id" "$cleanup_after"
    fi
    ;;
  404)
    printf 'Recorded Codex cloud database branch %s (%s) no longer exists.\n' \
      "$branch_name" "$branch_id"
    ;;
  *)
    printf 'Unable to inspect Neon branch %s (HTTP %s).\n' \
      "$branch_id" "$http_status" >&2
    exit 1
    ;;
esac
