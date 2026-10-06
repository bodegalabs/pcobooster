#!/usr/bin/env bash
# Writes Swift | Expo | difference images for every screen captured in both apps, and prints how
# much of each differs.
#
# Usage: scripts/compare.sh [light|dark]   (after scripts/capture.sh, with and without --swift)
# Output: .captures/compare-<appearance>/<name>.png
set -euo pipefail
cd "$(dirname "$0")/.."
appearance="${1:-light}"
swift=".captures/swift-$appearance"
expo=".captures/expo-$appearance"
out=".captures/compare-$appearance"
mkdir -p "$out"
for expo_shot in "$expo"/*.png; do
  name="$(basename "$expo_shot")"
  if [ -f "$swift/$name" ]; then
    uv run --quiet --with pillow python scripts/compare.py "$swift/$name" "$expo_shot" "$out/$name"
  fi
done
