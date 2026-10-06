#!/usr/bin/env bash
# Screenshots the app on fixtures with the fixed clock, under the same 14 names and launch
# arguments as the Swift reference (.audit/capture-swift.sh), so the two line up image for image.
#
# Usage: scripts/capture.sh [--appearance light|dark] [--udid <simulator>] [--out <dir>]
#                           [--swift <PCOBooster.app>]
#
# - Default: the Expo app from build/derived (scripts/build-ios.sh), in .captures/expo-<appearance>.
#   Screens that arrive in a later layer are skipped with a note.
# - --swift <app>: the Swift reference app instead (every screen), in .captures/swift-<appearance>.
# - The status bar is pinned (9:41, full bars and battery) for both, so only the app differs.
# - A Debug Expo build loads JavaScript from Metro; the script starts Metro on this checkout's
#   port (scripts/metro-port.sh) when it is not running, and stops it again at the end.
# - WAIT (seconds, default 4) is the pause after each launch.
set -euo pipefail
cd "$(dirname "$0")/.."

appearance="${APPEARANCE:-light}"
udid="${SIM_UDID:-}"
out=""
swift_app=""
while [ $# -gt 0 ]; do
  case "$1" in
    --appearance) appearance="$2"; shift ;;
    --udid) udid="$2"; shift ;;
    --out) out="$2"; shift ;;
    --swift) swift_app="$2"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 64 ;;
  esac
  shift
done

if [ -z "$udid" ]; then
  udid="$(xcrun simctl list devices available | awk -F '[()]' '/pcob-expo-foundation/ { print $2; exit }')"
fi
if [ -z "$udid" ]; then
  echo "No simulator: pass --udid or set SIM_UDID." >&2
  exit 1
fi

if [ -n "$swift_app" ]; then
  app="$swift_app"
  bundle=com.pcobooster.ios.debug
  out="${out:-.captures/swift-$appearance}"
else
  app=build/derived/Build/Products/Debug-iphonesimulator/PCOBooster.app
  bundle=com.pcobooster.ios
  out="${out:-.captures/expo-$appearance}"
fi
if [ ! -d "$app" ]; then
  echo "No app at $app; run scripts/build-ios.sh first." >&2
  exit 1
fi
mkdir -p "$out"

metro_pid=""
stop_metro() {
  if [ -n "$metro_pid" ]; then
    kill "$metro_pid" 2>/dev/null || true
    wait "$metro_pid" 2>/dev/null || true
  fi
}
trap stop_metro EXIT
if [ -z "$swift_app" ]; then
  port="$(bash scripts/metro-port.sh)"
  if ! curl -fs "http://127.0.0.1:$port/status" | grep -q running; then
    CI=1 bunx expo start --port "$port" > "$out/metro.log" 2>&1 &
    metro_pid=$!
    until curl -fs "http://127.0.0.1:$port/status" | grep -q running; do sleep 1; done
  fi
fi

xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" >/dev/null
xcrun simctl install "$udid" "$app"
xcrun simctl ui "$udid" appearance "$appearance"
xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

launch() {
  xcrun simctl terminate "$udid" "$bundle" 2>/dev/null || true
  xcrun simctl launch "$udid" "$bundle" -PCOBMock YES -PCOBFixedNow YES -PCOBFeatures all \
    -PCOBMockLatency 0 "$@" >/dev/null
}

if [ -z "$swift_app" ]; then
  # Bundle once before the first launch, so no shot waits on Metro.
  curl -fsS -o /dev/null \
    "http://127.0.0.1:$port/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app"
fi

# Screens the Expo app has so far; the rest arrive in later layers.
built="01-services 13-account 14-signin"
shot() {
  local name="$1"
  shift
  if [ -z "$swift_app" ] && [[ " $built " != *" $name "* ]]; then
    echo "skipped $name: arrives in a later layer"
    return
  fi
  launch "$@"
  sleep "${WAIT:-4}"
  xcrun simctl io "$udid" screenshot "$out/$name.png" >/dev/null 2>&1
  echo "$out/$name.png"
}
shot 01-services -PCOBTab services
shot 02-plan-overview -PCOBRoute /services/1101/plans/881261004
shot 03-plan-lineup -PCOBRoute /services/1101/plans/881261004/lineup
shot 04-plan-runsheet -PCOBRoute /services/1101/plans/881261004/plan
shot 05-plan-times -PCOBRoute /services/1101/plans/881261004/times
shot 06-assign -PCOBRoute /services/1101/plans/881261004/assign
shot 07-people -PCOBTab people
shot 08-person -PCOBRoute /people/4100104
shot 09-songs -PCOBTab songs
shot 10-song -PCOBRoute /songs/5501
shot 11-chart -PCOBRoute /songs/5501/chart
shot 12-search -PCOBTab search
shot 13-account -PCOBRoute /account
shot 14-signin -PCOBMockSession signedOut

xcrun simctl terminate "$udid" "$bundle" 2>/dev/null || true
xcrun simctl status_bar "$udid" clear
