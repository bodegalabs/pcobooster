#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/check-ios-toolchain.sh
bun run prebuild -- --clean --platform ios
pod install --project-directory=ios
destination="generic/platform=iOS Simulator"
if [[ -n "${MOBILE_SIMULATOR_ID:-}" ]]; then destination="platform=iOS Simulator,id=$MOBILE_SIMULATOR_ID"; fi
xcodebuild -workspace ios/pcoboostercom.xcworkspace -scheme pcoboostercom -configuration Debug -destination "$destination" -derivedDataPath build/simulator CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
