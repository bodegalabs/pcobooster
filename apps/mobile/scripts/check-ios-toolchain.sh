#!/usr/bin/env bash
set -euo pipefail

xcode_version="$(xcodebuild -version)"
if [[ ! "$xcode_version" =~ Xcode\ ([0-9]+)\.([0-9]+) ]]; then
  echo "Cannot determine the active Xcode version. Check xcode-select -p." >&2
  exit 1
fi

xcode_major="${BASH_REMATCH[1]}"
xcode_minor="${BASH_REMATCH[2]}"
if (( xcode_major < 26 || (xcode_major == 26 && xcode_minor < 4) )); then
  echo "Expo SDK 57 requires Xcode 26.4 or newer; active Xcode is ${xcode_major}.${xcode_minor}." >&2
  echo "Newer Xcode requires macOS Tahoe 26.2 or newer. Update macOS and Xcode, then select the new Xcode developer directory." >&2
  exit 1
fi
