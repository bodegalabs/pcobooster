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
  local node_major
  node_major="$(node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"

  if [[ "$node_major" != "$CODEX_CLOUD_NODE_MAJOR" ]]; then
    local nvm_script="${NVM_DIR:-${HOME}/.nvm}/nvm.sh"
    [[ -s "$nvm_script" ]] || codex_cloud_fail \
      "expected Node.js ${CODEX_CLOUD_NODE_MAJOR}.x and could not find the Codex image's NVM installation."

    # The universal Codex image includes Node 24 even when the settings UI only
    # exposes Node 22 as the newest selectable default.
    # shellcheck disable=SC1090
    source "$nvm_script"
    nvm use --silent "$CODEX_CLOUD_NODE_MAJOR" >/dev/null
    nvm alias default "$CODEX_CLOUD_NODE_MAJOR" >/dev/null
    node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  fi

  [[ "$node_major" == "$CODEX_CLOUD_NODE_MAJOR" ]] || codex_cloud_fail \
    "expected Node.js ${CODEX_CLOUD_NODE_MAJOR}.x, found $(node --version)."
}

codex_cloud_ensure_bun() {
  local bun_install_dir
  bun_install_dir="${BUN_INSTALL:-${HOME}/.bun}"

  if ! command -v bun >/dev/null 2>&1 || [[ "$(bun --version)" != "$CODEX_CLOUD_BUN_VERSION" ]]; then
    if command -v mise >/dev/null 2>&1; then
      mise use --global "bun@${CODEX_CLOUD_BUN_VERSION}"
      export PATH="${HOME}/.local/share/mise/shims:${PATH}"
      hash -r
    else
      curl --fail --silent --show-error --location https://bun.sh/install |
        bash -s "bun-v${CODEX_CLOUD_BUN_VERSION}"
      export PATH="${bun_install_dir}/bin:${PATH}"
    fi
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
