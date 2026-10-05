# Expo mobile migration inventory

Source inventory: `apps/ios/AGENTS.md`, Swift feature models, views, session/query runtime, platform configuration, and UI tests. Each row is an acceptance requirement, not a claim of verification.

| Area | Supported behavior to retain | Expo surface |
| --- | --- | --- |
| Shell | Services, feature-gated People and Songs, Search; nested route navigation; account sheet; plan segments Overview, Lineup, Plan, Times; Assign pushed separately; deep links | Expo Router retained per-tab stacks; tab bar remains on detail routes; root auth/Services-access gates; native account/editor modals |
| Services | My plans, date windows, service type filters, agenda, recent/past adjacent plans, plan header and previous/next navigation | Services and Plan screens |
| Overview | Staffing, pending/not-notified status, readiness, times, song summary; open corresponding plan segment | Overview segment |
| Lineup | Team/position grouping, open slots add/remove, person inspector, status confirmed/pending/declined, remove, time assignment, layout preferences and reorder | Lineup segment and person editor |
| Assign | Slot selection, candidates, organization-zone history/frequency/scoring/preferences, progressive availability, blockouts, someone else search, one-off assignment, unavailable/error retries | Assign route |
| Run sheet | Add item/header/song, autosave title/details/duration/service position, arrangement/key/layout/custom sequence, move/remove rows, song preview/history | Plan segment and item modal |
| Times | Day timeline, create/edit/delete, org-zone wall times, service/rehearsal/other, team/position/person assignment | Times segment and time modal |
| People | Team scope, health/attention and month activity, bounded progressive activity, person detail, previous/next month, blockouts, commitments linking to plans | People and Person screens |
| Songs | Library/search/filter, factual history/keys/tempo, detail, chart text and source key, transposition/lyrics, formatting, conflict handling, create song/arrangement, lyrics search, PDF preview/share | Songs, Song and Chart screens |
| Search | Plans, people and songs; recent searches; debounced directory reads; feature/access gates; links return to calling navigation stack | Search screen |
| Account | Linked/remembered account selection, additional account sign-in, device removal, Planning Center access facts, appearance, feedback, analytics opt-in/opt-out, sign-out | Account modal |
| Native auth | PKCE S256/random state, ephemeral auth browser, exact callback validation, one-use exchange, bearer token SecureStore, cancellation, active-token-only expiry, revocation, restore | Native auth/session modules |
| Persistence | Credential/account/demo-separated cache and preferences, cached first paint, stale revalidation on foreground/reconnect, no token in ordinary storage | TanStack Query and native cache adapter |
| Platform | Safe areas, keyboard avoidance, accessible labels/touch targets/Dynamic Type, iPad adaptive widths, light/dark, reduced motion, haptics, universal/custom links, PDFs sharing | Native controls and Expo modules |
| Safety | Demo writes disabled; scheduling proof against isolated synthetic adapter only; mutations keep completion outcome; no replay | Shared Effect RPC client and API synthetic stage |

## Exact supported runtime

The current source pins Expo **57.0.26**, React Native **0.86.3**, React **19.2.3**, Expo Router **57.0.24**, Babel preset **57.0.13**, and Effect **4.0.1**. Native module pins follow the installed Expo SDK 57 `bundledNativeModules.json`; Expo's [SDK reference](https://docs.expo.dev/versions/latest/) specifies React Native 0.86, React 19.2.3, Node 22.13 or later, iOS 16.4 or later, and Xcode 26.4 or later. Mobile owns its supported React version independently of the web app.

The installed Mac has **Xcode 26.3 with the 26.2 SDK**, below Expo 57's supported toolchain. The latest native build, simulator checks, screenshots and unsigned archive were produced with the prior **Expo 55.0.31 / React Native 0.83.10 / React 19.2.0** graph and are historical evidence. They do not validate the current Expo 57 native binary. An OS installer download is authorized; OS installation and restart remain human steps; the parent task resumes the authorized Xcode update afterward. Native scripts reject Xcode versions below 26.4 before generating or building a project. SDK 57 native acceptance remains pending those steps.

Installed SDK 57 declarations preserve the used auth APIs: `openAuthSessionAsync`, SecureStore's device-only Keychain accessibility and Crypto's S256/base64 primitives, checked against [WebBrowser](https://docs.expo.dev/versions/latest/sdk/webbrowser/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), and [Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/). File/share APIs and Router protected stacks also typecheck. Babel 57 uses `transformImportMeta`; `.babelrc` explicitly enables its Hermes transform. The custom entry retains the targeted `core-js` `toSorted` and `toReversed` imports because shared helpers use these methods and SDK 55 Hermes lacked them; SDK 57 runtime behavior still needs a native check.

Expo CLI 57's `createTypescriptResolver` reads extended tsconfig JSON directly, replacing the SDK 55 path that depended on TypeScript's `ts.sys`. The current mobile source also passes a direct TypeScript 7.0.2 check. This removes the previously verified compiler API reason for retaining TypeScript 5.9.3; mobile now pins TypeScript 7.0.2 in the shared Bun lockfile.

The stack's `rnd` build tool could not be identified from an authoritative source: npm `rnd` is a random string generator, while React Native Directory's CLI audits packages. Builds therefore use Expo prebuild, xcodebuild and Gradle on GitHub runners, as supported by [Expo CLI](https://docs.expo.dev/more/expo-cli/). No hosted paid build service is required. iOS bundle identity remains `com.pcobooster.ios`, callback schemes remain `pcobooster` and `pcobooster-dev`. Android uses the same reverse-domain package identity; no previous Android release existed.

## Acceptance evidence

- [x] Current Expo 57 source passes mobile TypeScript checks (including a direct TypeScript 7.0.2 check) and strict scoped lint. The parent task maintains the final workspace gate.
- [x] Current graph: 22 mobile test files / 71 tests pass, including auth, tagged cache, progressive partial visibility/completeness, observer-safe blur cancellation, route normalization/resume, PDF bytes and mutation completion regressions. Portable Swift behaviors are retained in shared client tests.
- [x] Current Expo 57 iOS and Android Hermes exports pass in the full workspace build; Expo prebuild generates both native projects without compiling.
- [ ] Current Expo 57 native simulator build and runtime verification: blocked by the unsupported installed Xcode, pending human OS/Xcode installation.
- [x] Historical SDK 55: Xcode ad hoc signed simulator build passed; actual browser sign-in and Keychain cold restoration passed using fictional local fixtures. Services, Lineup, Person and Assign rendered. Native navigation cancellation reached the fetch signal and a delayed fixture connection closed; a genuine Node abort-control request independently validated the server oracle (`proof/native-cancellation-node.json`). The computer-use coordinate tool subsequently returned `noWindowsAvailable`, limiting interactive button checks.
- [x] Environment blocker recorded: local Java, Android SDK, adb and emulator are unavailable. The free GitHub Gradle build path is provided; no Android runtime result is claimed.
- [x] Historical SDK 55: unsigned iPhone Release archive compiled and linked (`build-release-unsigned.log`); it is not installable. The signed archive failed because Xcode had no matching provisioning profile for `com.pcobooster.ios`. No automatic provisioning or upload was attempted. The current Expo 57 archive has not been built.
- [ ] Current revision native screenshots/video: unavailable until the compatible toolchain and native rebuild. `proof/lineup-tabs.png` and `proof/person-month.png` are historical SDK 55 images, not current revision acceptance. Superseded error videos and the blank Services image were removed.
- [x] Independent review found and drove fixes for stale 401 races, pending account switches, progressive cache freshness, tab focus cancellation, selected-slot preference scoring, secure-store behavior and protected routes.
- [ ] Real device verification requires an attached iPhone/iPad; none is available.

Fictional Cedar Grove fixtures are preserved as portable JSON under `src/fixtures`. They contain no live church data.

## Explicit verification limits

The inventory lists implemented requirements; it is not a claim that every UI button has been exercised on a simulator. Fictional fixture transport checks native client decoding, rendering and cache behavior. The native fixture server does not model scheduling writes into a mutable Lineup, so native scheduling completion/invalidation is not claimed from its canned mutation responses. It does not replace real Effect API/provider verification, which is separately covered by shared transport/API tests against the synthetic provider adapter. No live Planning Center writes are used for proof.

The prior development-only origin selector is replaced by the build setting `EXPO_PUBLIC_API_URL`. Native events are disabled unless the existing `POSTHOG_PROJECT_KEY` is explicitly mapped to `EXPO_PUBLIC_POSTHOG_PROJECT_KEY` and the user opts in. CI and fictional local verification omit the key. Only allowlisted event/procedure/error labels and an opaque random installation ID are sent; no recordings, inputs, people data or credentials are captured.
