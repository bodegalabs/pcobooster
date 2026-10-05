#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/check-ios-toolchain.sh
bun run native:generate -- --clean --platform ios
pod install --project-directory=ios
mkdir -p build
xcodebuild -workspace ios/pcoboostercom.xcworkspace -scheme pcoboostercom -configuration Release -destination 'generic/platform=iOS' -archivePath build/pcobooster.xcarchive -derivedDataPath build/derived archive
