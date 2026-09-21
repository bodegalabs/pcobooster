#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly STATE_PATH="${CODEX_CLOUD_STATE_PATH:-${REPOSITORY_ROOT}/.codex-cloud/session.json}"
readonly STATE_DIRECTORY="$(dirname -- "$STATE_PATH")"
readonly NEON_API_ORIGIN="${NEON_API_ORIGIN:-https://console.neon.tech/api/v2}"

: "${NEON_API_KEY:?Add NEON_API_KEY to Infisical Development /cloud.}"
: "${NEON_PROJECT_ID:?Add NEON_PROJECT_ID to Infisical Development /cloud.}"
: "${NEON_PARENT_BRANCH_ID:?Add NEON_PARENT_BRANCH_ID to Infisical Development /cloud.}"
: "${NEON_PARENT_DATABASE_URL:?Add NEON_PARENT_DATABASE_URL to Infisical Development /cloud.}"

ttl_hours="${CODEX_CLOUD_BRANCH_TTL_HOURS:-48}"
if [[ ! "$ttl_hours" =~ ^[0-9]+$ ]] || ((ttl_hours < 1 || ttl_hours > 168)); then
  printf 'CODEX_CLOUD_BRANCH_TTL_HOURS must be an integer from 1 through 168.\n' >&2
  exit 64
fi

expiry_enabled="${CODEX_CLOUD_NEON_EXPIRY_ENABLED:-0}"
if [[ "$expiry_enabled" != "0" && "$expiry_enabled" != "1" ]]; then
  printf 'CODEX_CLOUD_NEON_EXPIRY_ENABLED must be 0 or 1.\n' >&2
  exit 64
fi

if [[ -f "$STATE_PATH" ]]; then
  existing_branch_id="$(jq --exit-status --raw-output '.branchId' "$STATE_PATH")"
  existing_branch_name="$(jq --exit-status --raw-output '.branchName' "$STATE_PATH")"
  existing_database_url="$(jq --exit-status --raw-output '.databaseUrl' "$STATE_PATH")"
  http_status="$(curl \
    --silent \
    --output /dev/null \
    --write-out '%{http_code}' \
    --header "Authorization: Bearer ${NEON_API_KEY}" \
    "${NEON_API_ORIGIN}/projects/${NEON_PROJECT_ID}/branches/${existing_branch_id}")"

  if [[ "$http_status" == "200" ]]; then
    printf 'Reusing Codex cloud database branch %s (%s).\n' \
      "$existing_branch_name" "$existing_branch_id"
    printf 'Applying migrations to the isolated branch...\n'
    DATABASE_URL="$existing_database_url" bun run --cwd packages/api db:migrate
    printf 'Codex cloud session is ready.\n'
    exit 0
  fi

  if [[ "$http_status" != "404" ]]; then
    printf 'Unable to validate existing Neon branch %s (HTTP %s).\n' \
      "$existing_branch_id" "$http_status" >&2
    exit 1
  fi

  rm -- "$STATE_PATH"
fi

bash "${SCRIPT_DIR}/session-prune.sh"

git_revision="$(git rev-parse --short=8 HEAD)"
timestamp="$(date -u +%Y%m%d%H%M%S)"
random_suffix="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
branch_name="codex-${git_revision}-${timestamp}-${random_suffix}"
expires_at="$(
  CODEX_CLOUD_TTL_HOURS="$ttl_hours" bun --eval \
    'console.log(new Date(Date.now() + Number(process.env.CODEX_CLOUD_TTL_HOURS) * 60 * 60 * 1000).toISOString().replace(".000Z", "Z"))'
)"

if [[ "$expiry_enabled" == "1" ]]; then
  request_body="$(jq \
    --null-input \
    --arg name "$branch_name" \
    --arg parentId "$NEON_PARENT_BRANCH_ID" \
    --arg expiresAt "$expires_at" \
    '{branch: {name: $name, parent_id: $parentId, expires_at: $expiresAt}, endpoints: [{type: "read_write"}]}')"
else
  request_body="$(jq \
    --null-input \
    --arg name "$branch_name" \
    --arg parentId "$NEON_PARENT_BRANCH_ID" \
    '{branch: {name: $name, parent_id: $parentId}, endpoints: [{type: "read_write"}]}')"
fi
response_path="$(mktemp)"
trap 'rm -f -- "$response_path"' EXIT

http_status="$(curl \
  --silent \
  --show-error \
  --output "$response_path" \
  --write-out '%{http_code}' \
  --request POST \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer ${NEON_API_KEY}" \
  --data "$request_body" \
  "${NEON_API_ORIGIN}/projects/${NEON_PROJECT_ID}/branches")"

if [[ "$http_status" != "201" ]]; then
  error_message="$(jq --raw-output '.message // .error // "unknown Neon API error"' "$response_path" 2>/dev/null || true)"
  printf 'Unable to create Neon branch (HTTP %s): %s\n' \
    "$http_status" "$error_message" >&2
  exit 1
fi

branch_id="$(jq --exit-status --raw-output '.branch.id' "$response_path")"
endpoint_host="$(jq --exit-status --raw-output '.endpoints[0].host' "$response_path")"
database_url="$(
  NEON_ENDPOINT_HOST="$endpoint_host" bun --eval '
    const baseUrl = process.env.NEON_PARENT_DATABASE_URL;
    const endpointHost = process.env.NEON_ENDPOINT_HOST;
    if (!baseUrl || !endpointHost) throw new Error("Missing Neon connection input");
    const url = new URL(baseUrl);
    url.hostname = endpointHost;
    url.searchParams.set("sslmode", "require");
    console.log(url.toString());
  '
)"

mkdir -p -- "$STATE_DIRECTORY"
umask 077
jq \
  --null-input \
  --arg branchId "$branch_id" \
  --arg branchName "$branch_name" \
  --arg createdAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg databaseUrl "$database_url" \
  --arg expiresAt "$expires_at" \
  --argjson neonExpiryEnabled "$expiry_enabled" \
  --arg projectId "$NEON_PROJECT_ID" \
  '{version: 1, branchId: $branchId, branchName: $branchName, cleanupAfter: $expiresAt, createdAt: $createdAt, databaseUrl: $databaseUrl, neonExpiryEnabled: ($neonExpiryEnabled == 1), projectId: $projectId}' \
  >"$STATE_PATH"

if [[ "$expiry_enabled" == "1" ]]; then
  printf 'Created Codex cloud database branch %s (%s); Neon expiry is %s.\n' \
    "$branch_name" "$branch_id" "$expires_at"
else
  printf 'Created Codex cloud database branch %s (%s); cleanup deadline is %s.\n' \
    "$branch_name" "$branch_id" "$expires_at"
fi
printf 'Applying migrations to the isolated branch...\n'

if ! DATABASE_URL="$database_url" bun run --cwd packages/api db:migrate; then
  printf 'Migration failed. The branch remains available for diagnosis; run cloud:session:teardown afterward.\n' >&2
  exit 1
fi

printf 'Codex cloud session is ready.\n'
