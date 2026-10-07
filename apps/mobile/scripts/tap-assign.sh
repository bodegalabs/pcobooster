#!/usr/bin/env bash
# Fixture-only Assign interactions, on this layer's own simulator.
set -euo pipefail
cd "$(dirname "$0")/.."
udid="${SIM_UDID:-$(xcrun simctl list devices available -j | python3 -c 'import json,sys; data=json.load(sys.stdin); matches=[d["udid"] for ds in data["devices"].values() for d in ds if d["name"]=="pcob-expo-assign"]; sys.exit("Expected one pcob-expo-assign") if len(matches)!=1 else print(matches[0])')}"
name="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; print(next((d["name"] for ds in json.load(sys.stdin)["devices"].values() for d in ds if d["udid"]==sys.argv[1]), ""))' "$udid")"
if [ "$name" != pcob-expo-assign ]; then echo "Use only pcob-expo-assign." >&2; exit 64; fi
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
maestro="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
mkdir -p .captures/tap-assign
trap 'xcrun simctl terminate "$udid" com.pcobooster.ios >/dev/null 2>&1 || true' EXIT
flows=("$@")
if [ ${#flows[@]} -eq 0 ]; then
  flows=(assign-preview assign-add assign-offer assign-status assign-search assign-navigation assign-filter assign-slots assign-custom assign-day assign-lineup assign-lineup-status assign-swipe assign-menu)
fi
for flow in "${flows[@]}"; do
  xcrun simctl terminate "$udid" com.pcobooster.ios >/dev/null 2>&1 || true
  route=/services/1101/plans/881261004/assign
  if [[ "$flow" = assign-lineup* ]]; then route=/services/1101/plans/881261004/lineup; fi
  xcrun simctl launch "$udid" com.pcobooster.ios -PCOBMock YES -PCOBFixedNow YES -PCOBFeatures all -PCOBMockLatency 0 -PCOBRoute "$route" >/dev/null
  "$maestro" --device "$udid" test --test-output-dir ".captures/tap-assign/$flow" "maestro/$flow.yaml"
done
