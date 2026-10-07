#!/usr/bin/env bash
# Archive and upload the Expo app to App Store Connect.
# Usage: bun run ios:release [--no-upload] [--skip-build]
# --no-upload signs and exports an IPA without uploading it.
# --skip-build exports the existing archive only if it matches this clean revision.
set -euo pipefail

mobile="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$mobile/../.." && pwd)"
out="$mobile/build/release"
archive="$out/PCOBooster.xcarchive"
destination=upload
skip_build=0
for argument in "$@"; do
  case "$argument" in
    --no-upload) destination=export ;;
    --skip-build) skip_build=1 ;;
    --) ;;
    -h | --help) sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $argument" >&2; exit 64 ;;
  esac
done

assert_clean() {
  if [[ -n "$(git -C "$repo" status --porcelain --untracked-files=all)" ]]; then
    echo "Refusing to release uncommitted source. Commit tracked changes and untracked source first." >&2
    exit 1
  fi
}
assert_clean
revision="$(git -C "$repo" rev-parse HEAD)"
if [[ "$skip_build" == 1 ]]; then
  if [[ ! -d "$archive" || "$(cat "$out/revision" 2>/dev/null)" != "$revision" ]]; then
    echo "No archive exists for this exact revision. Run without --skip-build." >&2
    exit 1
  fi
  build="${BUILD_NUMBER:-$(cat "$out/build-number")}"
else
  build="${BUILD_NUMBER:-$(git -C "$repo" rev-list --count HEAD)}"
fi
if [[ ! "$build" =~ ^[1-9][0-9]*$ ]]; then
  echo "BUILD_NUMBER must be a positive integer without leading zeros." >&2
  exit 64
fi
# The previous native app used build 292 for version 0.1.0.
if [[ ${#build} -lt 3 || ( ${#build} -eq 3 && "$build" < 293 ) ]]; then
  echo "BUILD_NUMBER must exceed the previous release build 292." >&2
  exit 64
fi
export BUILD_NUMBER="$build"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

# Keep credentials out of Expo, Metro, CocoaPods, and the unsigned archive environment.
key_id="${ASC_KEY_ID:-}"
issuer_id="${ASC_ISSUER_ID:-}"
key_base64="${ASC_KEY_P8_BASE64:-}"
key_path="${ASC_KEY_PATH:-}"
unset ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8_BASE64 ASC_KEY_PATH
using_key=0
if [[ -n "$key_id$issuer_id$key_base64$key_path" ]]; then
  if [[ -z "$key_id" || -z "$issuer_id" || ( -z "$key_base64" && -z "$key_path" ) ]]; then
    echo "Supply ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_P8_BASE64 or ASC_KEY_PATH together." >&2
    exit 64
  fi
  if [[ -n "$key_base64" && -n "$key_path" ]]; then
    echo "Supply only one of ASC_KEY_P8_BASE64 and ASC_KEY_PATH." >&2
    exit 64
  fi
  if [[ -n "$key_path" && ! -r "$key_path" ]]; then
    echo "ASC_KEY_PATH must point to a readable private key." >&2
    exit 64
  fi
  using_key=1
elif [[ "${CI:-}" == true ]]; then
  echo "CI requires an App Store Connect API key for distribution signing." >&2
  exit 1
fi

key_dir=""
cleanup() {
  if [[ -n "$key_dir" ]]; then rm -rf "$key_dir"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$mobile"

if [[ "$skip_build" == 0 ]]; then
  available_kib="$(df -Pk "$mobile" | awk 'NR == 2 { print $4 }')"
  if [[ "$available_kib" -lt 15728640 ]]; then
    echo "A release archive requires at least 15 GiB of free disk space." >&2
    exit 1
  fi
  mkdir -p build
  prebuild_stamp="$(
    {
      bunx fingerprint fingerprint:generate --platform ios
      find assets/catalog -type f -print0 | sort -z | xargs -0 shasum
    } | shasum | cut -d' ' -f1
  )"
  if [[ ! -d ios || "$(cat build/prebuild.stamp 2>/dev/null)" != "$prebuild_stamp" ]]; then
    CI=1 bunx expo prebuild --no-install --platform ios
    (cd ios && pod install)
    printf '%s\n' "$prebuild_stamp" > build/prebuild.stamp
  elif ! cmp -s ios/Podfile.lock ios/Pods/Manifest.lock; then
    (cd ios && pod install)
  fi
  assert_clean
  if command -v ccache >/dev/null 2>&1; then
    CCACHE_BINARY="$(command -v ccache)"
    export CCACHE_BINARY
  fi
  rm -rf "$out"
  mkdir -p "$out"
  echo "==> Archiving pcobooster.com $revision (build $build)"
  NODE_ENV=production xcodebuild archive \
    -workspace ios/PCOBooster.xcworkspace -scheme PCOBooster -configuration Release \
    -destination 'generic/platform=iOS' -derivedDataPath build/derived-release \
    -archivePath "$archive" \
    ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CURRENT_PROJECT_VERSION="$build" \
    CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO
  assert_clean
  if [[ "$(git -C "$repo" rev-parse HEAD)" != "$revision" ]]; then
    echo "Source revision changed while archiving; refusing export." >&2
    exit 1
  fi
  printf '%s\n' "$revision" > "$out/revision"
  printf '%s\n' "$build" > "$out/build-number"
fi

info="$archive/Products/Applications/PCOBooster.app/Info.plist"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info")"
archived_build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info")"
bundle="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")"
if [[ "$bundle" != com.pcobooster.ios || "$version" != 0.1.0 || "$archived_build" != "$build" ]]; then
  echo "Archive identity, version, or build number does not match this release." >&2
  exit 1
fi

auth=(-allowProvisioningUpdates)
if [[ "$using_key" == 1 ]]; then
  if [[ -n "$key_base64" ]]; then
    key_dir="$(mktemp -d "${TMPDIR:-/tmp}/pcob-asc.XXXXXX")"
    chmod 700 "$key_dir"
    key_path="$key_dir/AuthKey_${key_id}.p8"
    (umask 077 && printf '%s' "$key_base64" | base64 --decode > "$key_path")
    chmod 600 "$key_path"
    unset key_base64
  fi
  auth+=(-authenticationKeyPath "$key_path" -authenticationKeyID "$key_id" -authenticationKeyIssuerID "$issuer_id")
fi
cat > "$out/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$destination</string>
  <key>teamID</key><string>6C46GY4Z38</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>testFlightInternalTestingOnly</key><false/>
  <key>uploadSymbols</key><true/>
</dict></plist>
PLIST
rm -rf "$out/export"
echo "==> Exporting pcobooster.com $version ($build), destination=$destination"
xcodebuild -exportArchive -archivePath "$archive" \
  -exportOptionsPlist "$out/ExportOptions.plist" -exportPath "$out/export" "${auth[@]}"
if [[ "$destination" == upload ]]; then
  echo "==> Upload finished. Verify App Store Connect processing and TestFlight availability separately."
else
  echo "==> Signed IPA exported to $out/export"
fi
