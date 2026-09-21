#!/usr/bin/env bash

set -euo pipefail

readonly CODEX_CLOUD_BUN_VERSION="1.3.9"
readonly CODEX_CLOUD_NODE_MAJOR="24"

codex_cloud_fail() {
  printf 'Codex cloud setup: %s\n' "$1" >&2
  exit 1
}

codex_cloud_install_apt_packages() {
  local packages=("$@")

  sudo apt-get update
  sudo apt-get install --yes "${packages[@]}"
}

codex_cloud_ensure_base_tools() {
  local missing_packages=()

  command -v curl >/dev/null 2>&1 || missing_packages+=(curl)
  command -v jq >/dev/null 2>&1 || missing_packages+=(jq)

  if ((${#missing_packages[@]} > 0)); then
    codex_cloud_install_apt_packages "${missing_packages[@]}"
  fi
}

codex_cloud_ensure_node() {
  command -v node >/dev/null 2>&1 || codex_cloud_fail \
    "Node.js is missing. Set Node.js ${CODEX_CLOUD_NODE_MAJOR} in the Codex environment package versions."

  local node_major
  node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  [[ "$node_major" == "$CODEX_CLOUD_NODE_MAJOR" ]] || codex_cloud_fail \
    "expected Node.js ${CODEX_CLOUD_NODE_MAJOR}.x, found $(node --version). Set the package version in Codex environment settings."
}

codex_cloud_ensure_bun() {
  local bun_install_dir
  bun_install_dir="${BUN_INSTALL:-${HOME}/.bun}"

  if ! command -v bun >/dev/null 2>&1 || [[ "$(bun --version)" != "$CODEX_CLOUD_BUN_VERSION" ]]; then
    curl --fail --silent --show-error --location https://bun.sh/install |
      bash -s "bun-v${CODEX_CLOUD_BUN_VERSION}"
    export PATH="${bun_install_dir}/bin:${PATH}"
  fi

  if ! grep --fixed-strings --quiet "${bun_install_dir}/bin" "${HOME}/.bashrc" 2>/dev/null; then
    printf '\nexport PATH="%s/bin:$PATH"\n' "$bun_install_dir" >>"${HOME}/.bashrc"
  fi

  [[ "$(bun --version)" == "$CODEX_CLOUD_BUN_VERSION" ]] || codex_cloud_fail \
    "expected Bun ${CODEX_CLOUD_BUN_VERSION}, found $(bun --version)."
}

codex_cloud_ensure_infisical() {
  if command -v infisical >/dev/null 2>&1; then
    return
  fi

  curl --fail --silent --show-error --location \
    https://artifacts-cli.infisical.com/setup.deb.sh |
    sudo -E bash
  codex_cloud_install_apt_packages infisical
}

codex_cloud_bootstrap() {
  codex_cloud_ensure_base_tools
  codex_cloud_ensure_node
  codex_cloud_ensure_bun
  codex_cloud_ensure_infisical
}
