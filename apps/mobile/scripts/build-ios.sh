#!/usr/bin/env bash
# Builds the app for an iOS simulator, incrementally.
#
# Usage: scripts/build-ios.sh [--clean] [--configuration Debug|Release] [--udid <simulator udid>]
#
# - Prebuild and `pod install` run only when their inputs changed, never with --clean by
#   default, so the generated ios/ folder and its Pods stay put; pass --clean to regenerate
#   both from scratch (after removing a native module, for example).
# - --no-debug-symbols omits symbol and index data when disk space is limited.
# - Xcode keeps one derived-data folder per worktree in build/derived (git-ignored).
# - ccache is on when it is installed (app.config.ts asks `command -v ccache`). React Native's
#   compiler wrapper (scripts/xcode/ccache-clang.sh) runs `$CCACHE_BINARY clang`, but Xcode does
#   not pass build settings to compiler processes, so the binary is exported here; without it the
#   wrapper silently runs plain clang.
# - A Debug build loads JavaScript from Metro on this checkout's port (scripts/metro-port.sh:
#   METRO_PORT, 8081 in the main checkout, a path-derived port in a worktree).
set -euo pipefail
cd "$(dirname "$0")/.."

clean=0
configuration=Debug
extra_settings=()
udid="${SIM_UDID:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --clean) clean=1 ;;
    --no-debug-symbols) extra_settings+=(GCC_GENERATE_DEBUGGING_SYMBOLS=NO DEBUG_INFORMATION_FORMAT=dwarf COMPILER_INDEX_STORE_ENABLE=NO SWIFT_SERIALIZE_DEBUGGING_OPTIONS=NO) ;;
    --configuration) configuration="$2"; shift ;;
    --udid) udid="$2"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 64 ;;
  esac
  shift
done

mkdir -p build
if [ "$clean" = 1 ]; then
  rm -rf ios build/derived build/prebuild.stamp
fi

# Prebuild rewrites the Xcode project from its template and drops what CocoaPods added to it,
# which forces a full recompile, so it runs only when native inputs change. Expo's fingerprint
# covers the evaluated app config (plugins, build properties, and whether ccache is installed),
# the app icon, and the autolinked native modules, so a JavaScript-only dependency does not count.
# The asset catalog files the config plugin copies are hashed beside it.
prebuild_stamp="$(
  {
    bunx fingerprint fingerprint:generate --platform ios
    find assets/catalog -type f -print0 | sort -z | xargs -0 shasum
  } | shasum | cut -d' ' -f1
)"
if [ ! -d ios ] || [ "$(cat build/prebuild.stamp 2>/dev/null)" != "$prebuild_stamp" ]; then
  CI=1 bunx expo prebuild --no-install --platform ios
  (cd ios && pod install)
  echo "$prebuild_stamp" > build/prebuild.stamp
elif ! cmp -s ios/Podfile.lock ios/Pods/Manifest.lock; then
  (cd ios && pod install)
fi

if command -v ccache >/dev/null 2>&1; then
  CCACHE_BINARY="$(command -v ccache)"
  export CCACHE_BINARY
fi

if [ -n "$udid" ]; then
  destination="platform=iOS Simulator,id=$udid"
else
  destination="generic/platform=iOS Simulator"
fi
xcodebuild \
  -workspace ios/PCOBooster.xcworkspace \
  -scheme PCOBooster \
  -configuration "$configuration" \
  -destination "$destination" \
  -derivedDataPath build/derived \
  RCT_METRO_PORT="$(bash scripts/metro-port.sh)" \
  ${extra_settings[@]+"${extra_settings[@]}"} \
  build
echo "build/derived/Build/Products/$configuration-iphonesimulator/PCOBooster.app"
