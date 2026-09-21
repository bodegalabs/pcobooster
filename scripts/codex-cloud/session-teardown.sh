#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly STATE_PATH="${CODEX_CLOUD_STATE_PATH:-${REPOSITORY_ROOT}/.codex-cloud/session.json}"
readonly STATE_DIRECTORY="$(dirname -- "$STATE_PATH")"
readonly NEON_API_ORIGIN="${NEON_API_ORIGIN:-https://console.neon.tech/api/v2}"

if [[ ! -f "$STATE_PATH" ]]; then
  printf 'No Codex cloud database session needs teardown.\n'
  exit 0
fi

: "${NEON_API_KEY:?Add NEON_API_KEY to Infisical Development /cloud.}"
: "${NEON_PROJECT_ID:?Add NEON_PROJECT_ID to Infisical Development /cloud.}"

branch_id="$(jq --exit-status --raw-output '.branchId' "$STATE_PATH")"
branch_name="$(jq --exit-status --raw-output '.branchName' "$STATE_PATH")"
state_project_id="$(jq --exit-status --raw-output '.projectId' "$STATE_PATH")"

if [[ "$state_project_id" != "$NEON_PROJECT_ID" ]]; then
  printf 'Refusing teardown: recorded Neon project %s does not match configured project %s.\n' \
    "$state_project_id" "$NEON_PROJECT_ID" >&2
  exit 1
fi

response_path="$(mktemp)"
trap 'rm -f -- "$response_path"' EXIT
http_status="$(curl \
  --silent \
  --show-error \
  --output "$response_path" \
  --write-out '%{http_code}' \
  --request DELETE \
  --header 'Accept: application/json' \
  --header "Authorization: Bearer ${NEON_API_KEY}" \
  "${NEON_API_ORIGIN}/projects/${NEON_PROJECT_ID}/branches/${branch_id}")"

if [[ "$http_status" != "200" && "$http_status" != "204" && "$http_status" != "404" ]]; then
  error_message="$(jq --raw-output '.message // .error // "unknown Neon API error"' "$response_path" 2>/dev/null || true)"
  printf 'Unable to delete Neon branch %s (HTTP %s): %s\n' \
    "$branch_id" "$http_status" "$error_message" >&2
  exit 1
fi

rm -- "$STATE_PATH"
rmdir -- "$STATE_DIRECTORY" 2>/dev/null || true
printf 'Deleted Codex cloud database branch %s (%s).\n' "$branch_name" "$branch_id"
