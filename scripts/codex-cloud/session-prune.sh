#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly STATE_PATH="${CODEX_CLOUD_STATE_PATH:-${REPOSITORY_ROOT}/.codex-cloud/session.json}"
readonly NEON_API_ORIGIN="${NEON_API_ORIGIN:-https://console.neon.tech/api/v2}"

: "${NEON_API_KEY:?Add NEON_API_KEY to Infisical Development /cloud.}"
: "${NEON_PROJECT_ID:?Add NEON_PROJECT_ID to Infisical Development /cloud.}"

ttl_hours="${CODEX_CLOUD_BRANCH_TTL_HOURS:-48}"
if [[ ! "$ttl_hours" =~ ^[0-9]+$ ]] || ((ttl_hours < 1 || ttl_hours > 168)); then
  printf 'CODEX_CLOUD_BRANCH_TTL_HOURS must be an integer from 1 through 168.\n' >&2
  exit 64
fi

active_branch_id=""
if [[ -f "$STATE_PATH" ]]; then
  active_branch_id="$(jq --exit-status --raw-output '.branchId' "$STATE_PATH")"
fi

cutoff="$(
  CODEX_CLOUD_TTL_HOURS="$ttl_hours" bun --eval \
    'console.log(new Date(Date.now() - Number(process.env.CODEX_CLOUD_TTL_HOURS) * 60 * 60 * 1000).toISOString().replace(".000Z", "Z"))'
)"
response_path="$(mktemp)"
trap 'rm -f -- "$response_path"' EXIT

http_status="$(curl \
  --silent \
  --show-error \
  --output "$response_path" \
  --write-out '%{http_code}' \
  --header 'Accept: application/json' \
  --header "Authorization: Bearer ${NEON_API_KEY}" \
  "${NEON_API_ORIGIN}/projects/${NEON_PROJECT_ID}/branches?search=codex-")"

if [[ "$http_status" != "200" ]]; then
  printf 'Unable to list stale Codex cloud branches (HTTP %s).\n' "$http_status" >&2
  exit 1
fi

pruned_count=0
while IFS=$'\t' read -r branch_id branch_name; do
  [[ -n "$branch_id" ]] || continue
  [[ "$branch_id" != "$active_branch_id" ]] || continue

  delete_status="$(curl \
    --silent \
    --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request DELETE \
    --header 'Accept: application/json' \
    --header "Authorization: Bearer ${NEON_API_KEY}" \
    "${NEON_API_ORIGIN}/projects/${NEON_PROJECT_ID}/branches/${branch_id}")"

  if [[ "$delete_status" != "200" && "$delete_status" != "204" && "$delete_status" != "404" ]]; then
    printf 'Unable to prune Neon branch %s (%s; HTTP %s).\n' \
      "$branch_name" "$branch_id" "$delete_status" >&2
    exit 1
  fi

  printf 'Pruned stale Codex cloud database branch %s (%s).\n' "$branch_name" "$branch_id"
  ((pruned_count += 1))
done < <(jq \
  --raw-output \
  --arg cutoff "$cutoff" \
  '.branches[] | select(.name | startswith("codex-")) | select(.created_at < $cutoff) | [.id, .name] | @tsv' \
  "$response_path")

if ((pruned_count == 0)); then
  printf 'No stale Codex cloud database branches found.\n'
fi
