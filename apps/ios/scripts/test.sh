#!/usr/bin/env bash
# Run the iOS checks: the PCOBoosterCore package tests on the Mac (no simulator),
# then a simulator build of the app with its UI tests.
#
#   bash apps/ios/scripts/test.sh            package tests and app build
#   bash apps/ios/scripts/test.sh --ui       also run the UI tests on a simulator
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
simulator="${IOS_SIMULATOR:-iPhone 17 Pro}"

echo "==> PCOBoosterCore tests"
swift test --package-path "$root/PCOBoosterCore" --quiet

echo "==> App build (iOS Simulator)"
xcodebuild build -quiet \
  -project "$root/PCOBooster.xcodeproj" -scheme PCOBooster \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$root/build/dd"

if [[ "${1:-}" == "--ui" ]]; then
  echo "==> UI tests ($simulator)"
  xcodebuild test -quiet \
    -project "$root/PCOBooster.xcodeproj" -scheme PCOBooster \
    -destination "platform=iOS Simulator,name=$simulator" \
    -derivedDataPath "$root/build/dd"
fi
