# Mobile development

`apps/mobile` is the Expo Router app for pcobooster.com. `packages/client` supplies the shared Effect RPC client, query keys, retry and priority logic; contracts and pure Planning Center rules are shared with the web app. Mobile owns native navigation, SecureStore credentials, AsyncStorage query persistence and platform controls.

## Run locally

Install the pinned workspace with `bun install --frozen-lockfile`. Start the Workers with `bun run dev`, then run `EXPO_PUBLIC_API_URL=<product URL> bun run mobile:dev` using the product URL printed by the Workers command. The native origin is build configuration; regenerate the bundle when changing it. A physical device needs a reachable local network origin; simulator loopback can use the host's product port.

The mobile app uses Planning Center browser OAuth with PKCE, exact callback/state validation and a single-use exchange. Session bearer credentials stay in SecureStore, and native requests omit cookies. Query caches are partitioned by origin, credential hash, selected account and demo identity. Foreground and connectivity transitions revalidate active queries.

Development PAT bypass belongs to the local API; it is not a credential to embed in the native app. Read-only production checks are separate from synthetic scheduling mutation verification. Presentation mode masks data and still writes to the real provider.

## Build without a paid service

The supported toolchain is pinned to Expo 57.0.26, React Native 0.86.3 and React 19.2.3, matching Expo's bundled native module manifest. iOS builds require Xcode 26.4 or newer; CI explicitly selects Xcode 26.6. Apple requires macOS Tahoe 26.2 or newer for that toolchain. The local Mac now runs macOS Tahoe 26.7.1 and Xcode 27.0 (27A266a). The current SDK 57 ad hoc signed simulator build passes with the iOS 27 SDK; runtime verification and release compilation are tracked in the migration inventory. Earlier SDK 55 results remain historical. See [Expo SDK requirements](https://docs.expo.dev/versions/latest/) and [Apple system requirements](https://developer.apple.com/xcode/system-requirements).

- `bun run build` exports native JavaScript assets alongside the web builds.
- `bun run mobile:test:ios` generates the native iOS project, installs pods and builds an ad hoc signed simulator app with Keychain entitlements.
- `bun run mobile:build:android` generates the Android project and builds a debug APK with Gradle. Install Java 17 and the Android SDK first.
- `bun run mobile:release:ios` creates a local release archive using configured Apple signing. An archive is separate from device testing, TestFlight upload and store submission.

Expo-generated `ios`, `android`, `.expo`, and build directories are ignored. Reproduce them from committed app config and the Bun lockfile. CI runs ad hoc simulator and Android debug builds without a distribution certificate or hosted EAS. Existing iOS identity remains `com.pcobooster.ios`, Apple team `6C46GY4Z38`, and callback schemes `pcobooster`/`pcobooster-dev`. HTTPS demo invitations associate pcobooster.com with the app via the public Apple association file.

The stack document's `rnd` build reference could not be matched to an authoritative React Native build tool. The implemented fallback is the documented Expo prebuild, xcodebuild and Gradle path. See [mobile migration inventory](../apps/mobile/MIGRATION.md) for feature-level acceptance and current limitations.

## Validation and cutover

Xcode 27 requires the UIKit scene lifecycle. The pinned `expo-build-properties` 57.0.22 plugin enables `ios.enableSceneSupport`, using Expo 57's official scene delegate and URL/lifecycle forwarding. See [Expo's SDK 57 scene migration guide](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).

Explicit native generation uses `bun run --cwd apps/mobile native:generate`. Keep generation, pod installation and compilation sequential. The package deliberately has no `prebuild` lifecycle script: Bun runs that hook before `build`, and Expo 57 regenerates native directories by default, which can erase Pods during another native build.

`bun run ci` checks native types and tests as part of the workspace gate. Retained fictional Swift fixtures now exercise shared TypeScript behavior, including timezone boundaries, distinct-day frequency, blockout continuation and chart transformations. Native SecureStore/auth/cache/lifecycle tests and synthetic server mutation tests cover separate platform boundaries.

This is a coordinated breaking client/server migration. Deploy the matching web/API revision and release the matching Expo app together after acceptance. Rollback restores both transport and clients together; older Swift binaries cannot talk to the new native Effect RPC protocol. No upload or deployment is performed by these development commands.
