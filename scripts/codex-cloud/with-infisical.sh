#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly PROJECT_CONFIG_PATH="${REPOSITORY_ROOT}/.infisical.json"

if (($# == 0)); then
  printf 'Usage: %s <command> [arguments...]\n' "$0" >&2
  exit 64
fi

command -v infisical >/dev/null 2>&1 || {
  printf 'Infisical CLI is missing. Run scripts/codex-cloud/setup.sh first.\n' >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  printf 'jq is missing. Run scripts/codex-cloud/setup.sh first.\n' >&2
  exit 1
}

project_id="${INFISICAL_PROJECT_ID:-$(jq --raw-output '.workspaceId' "$PROJECT_CONFIG_PATH")}"
environment="${INFISICAL_ENVIRONMENT:-dev}"
secret_path="${INFISICAL_CLOUD_PATH:-/cloud}"

if [[ -z "$project_id" || "$project_id" == "null" ]]; then
  printf 'Unable to resolve the Infisical project ID.\n' >&2
  exit 1
fi

if [[ -n "${INFISICAL_TOKEN:-}" ]]; then
  access_token="$INFISICAL_TOKEN"
else
  : "${INFISICAL_CLIENT_ID:?Set INFISICAL_TOKEN or INFISICAL_CLIENT_ID in the Codex cloud environment.}"
  : "${INFISICAL_CLIENT_SECRET:?Set INFISICAL_TOKEN or INFISICAL_CLIENT_SECRET in the Codex cloud environment.}"

  if ! access_token="$({
    infisical login \
      --method=universal-auth \
      --client-id="$INFISICAL_CLIENT_ID" \
      --client-secret="$INFISICAL_CLIENT_SECRET" \
      --silent \
      --plain
  } 2>/dev/null)"; then
    printf 'Infisical Universal Auth failed. Check the cloud identity credentials and scope.\n' >&2
    exit 1
  fi

  if [[ -z "$access_token" ]]; then
    printf 'Infisical Universal Auth returned an empty access token.\n' >&2
    exit 1
  fi
fi

cd "$REPOSITORY_ROOT"
exec infisical run \
  --silent \
  --token="$access_token" \
  --projectId="$project_id" \
  --env="$environment" \
  --path="$secret_path" \
  -- bash scripts/codex-cloud/exec.sh "$@"
