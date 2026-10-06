#!/usr/bin/env bash
# Runs fixture-only UI flows on the session simulator. Metro must be running on this worktree's port.
set -euo pipefail
cd "$(dirname "$0")/.."
udid="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; data=json.load(sys.stdin); matches=[d["udid"] for devices in data["devices"].values() for d in devices if d["name"]=="pcob-expo-session"]; sys.exit("Expected exactly one pcob-expo-session simulator") if len(matches)!=1 else print(matches[0])')"
name="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; data=json.load(sys.stdin); print(next((d["name"] for devices in data["devices"].values() for d in devices if d["udid"]==sys.argv[1]), ""))' "$udid")"
if [ "$name" != pcob-expo-session ]; then
  echo "Use only pcob-expo-session for these flows." >&2
  exit 64
fi
if [ -z "${JAVA_HOME:-}" ] && [ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi
maestro="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
mkdir -p .captures/tap-session
trap 'xcrun simctl terminate "$udid" com.pcobooster.ios >/dev/null 2>&1 || true' EXIT
for flow in demo-link switch-account sign-out services-filter account-actions feedback; do
  state=signedIn
  if [ "$flow" = demo-link ]; then state=signedOut; fi
  xcrun simctl terminate "$udid" com.pcobooster.ios >/dev/null 2>&1 || true
  xcrun simctl launch "$udid" com.pcobooster.ios -PCOBMock YES -PCOBMockSession "$state" \
    -PCOBFixedNow YES -PCOBFeatures all -PCOBMockLatency 0 >/dev/null
  "$maestro" --device "$udid" test --test-output-dir ".captures/tap-session/$flow" "flows/$flow.yaml"
done
