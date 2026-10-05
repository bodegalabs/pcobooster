#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bun run prebuild -- --clean --platform android
cd android
./gradlew --no-daemon assembleDebug
