#!/usr/bin/env bash
# Archive the iOS app and upload it to App Store Connect, where it lands in TestFlight once
# processing finishes (usually 5 to 15 minutes).
#
#   bun run ios:release                 test, archive, export, and upload
#   bun run ios:release --no-upload     test, archive, and export an .ipa only
#
# With the production secrets (the PostHog key lives in Infisical Production "/"):
#
#   infisical run --env=prod --path=/ --projectId=2eca20e1-20ac-4f06-a086-99ea5c590483 -- \
#     bun run ios:release
#
# Environment:
#   BUILD_NUMBER        CURRENT_PROJECT_VERSION for this upload. Defaults to the commit count of
#                       origin/main (fetched first), which only grows. App Store Connect refuses a
#                       build number it has already seen for the version, so override it when
#                       releasing twice from one main commit.
#   ALLOW_DIRTY=1       Release with uncommitted changes (normally refused, so every build maps
#                       to a commit).
#   POSTHOG_PROJECT_KEY Built in as PCOB_POSTHOG_KEY; without it the build sends no analytics.
#   ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_P8_BASE64 (or ASC_KEY_PATH)
#                       App Store Connect API key for signing and upload. The base64 key is
#                       decoded into a private temporary file that is deleted on exit. Without a
#                       key, xcodebuild uses the Apple ID signed in to Xcode (Settings > Accounts).
#                       CI has no Apple ID, so there the key is required, and it needs the Admin
#                       role to create the cloud-managed distribution certificate.
#
# Signing is automatic for team 6C46GY4Z38. The archive is unsigned (automatic signing would
# want a development profile, which needs a registered device); the export signs it for
# distribution and creates the certificate and profile as needed (-allowProvisioningUpdates).
# The version is MARKETING_VERSION in the Xcode project.
set -euo pipefail

usage() {
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
}

ios="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$ios/../.." && pwd)"
project="$ios/PCOBooster.xcodeproj"
out="$ios/build/release"
team="6C46GY4Z38"
destination=upload

for argument in "$@"; do
  case "$argument" in
    --no-upload) destination=export ;;
    --) ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $argument" >&2
      usage >&2
      exit 64
      ;;
  esac
done

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

if [[ "${ALLOW_DIRTY:-}" != "1" && -n "$(git -C "$repo" status --porcelain)" ]]; then
  echo "Refusing to release with uncommitted changes. Commit them, or set ALLOW_DIRTY=1." >&2
  exit 1
fi

build="${BUILD_NUMBER:-}"
if [[ -z "$build" ]]; then
  git -C "$repo" fetch --quiet origin main || echo "warning: couldn't fetch origin/main; using the local copy" >&2
  build="$(git -C "$repo" rev-list --count origin/main)"
fi
if [[ ! "$build" =~ ^[1-9][0-9]*$ ]]; then
  echo "BUILD_NUMBER must be a positive integer (got \"$build\")." >&2
  exit 64
fi

build_settings=(CURRENT_PROJECT_VERSION="$build" CODE_SIGNING_ALLOWED=NO)
if [[ -n "${POSTHOG_PROJECT_KEY:-}" ]]; then
  build_settings+=(PCOB_POSTHOG_KEY="$POSTHOG_PROJECT_KEY")
else
  echo "note: POSTHOG_PROJECT_KEY is not set, so this build sends no analytics."
fi

auth=(-allowProvisioningUpdates)
key_dir=""
cleanup() {
  if [[ -n "$key_dir" ]]; then
    rm -rf "$key_dir"
  fi
}
trap cleanup EXIT

if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]]; then
  key_path=""
  if [[ -n "${ASC_KEY_P8_BASE64:-}" ]]; then
    temp_root="${TMPDIR:-/tmp}"
    key_dir="$(mktemp -d "${temp_root%/}/pcob-asc.XXXXXX")"
    chmod 700 "$key_dir"
    key_path="$key_dir/AuthKey_${ASC_KEY_ID}.p8"
    (umask 077 && printf '%s' "$ASC_KEY_P8_BASE64" | base64 --decode >"$key_path")
    chmod 600 "$key_path"
  elif [[ -n "${ASC_KEY_PATH:-}" ]]; then
    key_path="$ASC_KEY_PATH"
  fi
  if [[ -n "$key_path" ]]; then
    auth+=(-authenticationKeyPath "$key_path" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
    echo "==> Using App Store Connect API key $ASC_KEY_ID"
  fi
fi

if [[ "${CI:-}" == "true" && ${#auth[@]} -eq 1 && "$destination" == upload ]]; then
  echo "CI has no Apple ID to sign with. Add ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_P8_BASE64" >&2
  echo "(an Admin App Store Connect API key) to Infisical Production \"/\"; see docs/ci-cd.md." >&2
  exit 1
fi

echo "==> Testing PCOBoosterCore"
swift test --package-path "$ios/PCOBoosterCore" --quiet

rm -rf "$out"
mkdir -p "$out"

echo "==> Archiving (build $build)"
xcodebuild archive -quiet \
  -project "$project" -scheme PCOBooster -configuration Release \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$ios/build/dd-release" \
  -archivePath "$out/PCOBooster.xcarchive" \
  "${build_settings[@]}"

info="$out/PCOBooster.xcarchive/Products/Applications/PCOBooster.app/Info.plist"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info")"
echo "==> Archived PCOBooster $version ($build)"

cat >"$out/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$destination</string>
  <key>teamID</key><string>$team</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>testFlightInternalTestingOnly</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

echo "==> Exporting ($destination)"
export_archive() {
  xcodebuild -exportArchive \
    -archivePath "$out/PCOBooster.xcarchive" \
    -exportOptionsPlist "$out/ExportOptions.plist" \
    -exportPath "$out/export" \
    "$@"
}

# A key without the Admin role can upload but cannot create the cloud-managed distribution
# certificate ("Cloud signing permission error"). Fall back to the Apple ID signed in to Xcode.
if ! export_archive "${auth[@]}"; then
  if [[ ${#auth[@]} -gt 1 && "${CI:-}" != "true" ]]; then
    echo "==> Export with the API key failed; retrying with the Apple ID signed in to Xcode"
    rm -rf "$out/export"
    export_archive -allowProvisioningUpdates
  else
    exit 1
  fi
fi

if [[ "$destination" == upload ]]; then
  echo "==> Uploaded PCOBooster $version ($build). It appears in TestFlight after processing."
else
  echo "==> Exported to $out/export"
  ls -la "$out/export"
fi
