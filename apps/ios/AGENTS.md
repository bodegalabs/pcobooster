# iOS app (apps/ios)

Native SwiftUI app for pcobooster.com on iOS 26 (iPhone and iPad), built on the same oRPC API as the web product. Read the root `AGENTS.md` first; every product rule there (org time zone, request budget, autosave on close, no success toasts, instant color changes, inform rather than recommend songs) applies here too.

## Layout

- `PCOBooster.xcodeproj`: hand-written, folder-synced (objectVersion 77). New files under `PCOBooster/` and `PCOBoosterUITests/` join their target automatically; do not add file references to the project. The shared scheme is `PCOBooster`.
- `PCOBooster/`: the app target. `App/` (entry, `AppModel`, routing, root views, analytics, support), `DesignSystem/` (tokens, components, motion), `Features/<Area>/` (one folder per product area), `Resources/` (`Assets.xcassets`, `AppIcon.icon`, `PrivacyInfo.xcprivacy`), `Info.plist`. Keep non-source files (READMEs) out of `PCOBooster/`: the synced folder copies them into the app bundle.
- `PCOBoosterUITests/`: XCUITest launch and shell smoke tests on mock data.
- `PCOBoosterCore/`: local Swift package, platform-neutral (Foundation only, no UIKit/SwiftUI), so `swift test` runs on the Mac without a simulator.
  - `API/Generated/`: models and procedure descriptors generated from `packages/contracts` by `bun run ios:models` (`scripts/ios/generate-swift-models.ts`). Never edit by hand; a Vitest drift test fails when they are stale.
  - `API/Runtime/`: transport, client, errors, request scheduler, JSON coding.
  - `Logic/<Area>/`: Swift ports of browser-only TypeScript, each pinned by a parity suite.
  - `PCOBoosterMock`: fictional fixtures (`Fixtures/<namespace>.<procedure>.json`) and `MockTransport` for previews, UI tests, and screenshots.
- `scripts/`: `test.sh` (package tests and app build), `release.sh` (archive and upload).

## Commands

- `bun run ios:test`: package tests plus a simulator build (`--ui` adds UI tests).
- `swift test --package-path apps/ios/PCOBoosterCore`: package tests only.
- `bun run ios:models`: regenerate API models after a contract change.
- `bun run parity:update`: regenerate parity fixtures after changing ported TypeScript.
- `bun run ios:release` (`--no-upload` to export only): test, archive, and upload to TestFlight. Run it under `infisical run --env=prod --path=/ --projectId=2eca20e1-20ac-4f06-a086-99ea5c590483 --` so the PostHog key is built in; see the header of `scripts/release.sh` for `BUILD_NUMBER`, `ALLOW_DIRTY`, and the App Store Connect key variables.
- Build into `apps/ios/build/` (ignored) with `-derivedDataPath`, never the default DerivedData, so worktrees do not collide.

## App shell

The shell (`App/`) owns the session, navigation, and app-wide services; features fill `Features/<Area>/` and keep the initializers listed below.

### AppModel and the environment

- `AppModel` (`App/AppModel.swift`) is the root `@Observable`, injected at the window. Read it with `@Environment(AppModel.self) private var app`. It holds `services` (`rpc`, `queries`, `session`), `router`, `toasts`, `analytics`, `network`, `clock`, `configuration`, `appearance`, and `account`.
- `app.account` (`AccountContext`) holds the reads every screen shares for the current account context: `features`, `accounts`, `access`, and `organization`. A new one is built whenever the query scope changes (sign-in, account or organization switch, demo, sign-out), and the root view rebuilds with `.id(queries.scope)`, so nothing crosses accounts.
- Environment values set at the root: `AppModel`, `AppRouter`, `ToastCenter` (from `.errorToasts`), `\.orgTimeZone` (validated congregation zone), and `\.appClock`.
- Session states (`app.state`): `.launching` (brand splash while the session restores or a new account's flags load, at most 1.5 s), `.signedOut(expired:)` and `.signingIn` (the sign-in screen; `expired` shows "Jordan's session ended"), `.signedIn` (also local development), and `.demo`. A 401 on the active token moves to `.signedOut(expired:)`; signing in again as the same person keeps the cache.

### Building a screen

- Hold reads in an `@Observable` model built with `@ScreenModel` (`App/Support/ScreenModel.swift`): it builds once per view identity, with the app's dependencies, before the first frame, so disk-cached values paint without a skeleton flash.

  ```swift
  struct RunSheetView: View {
    let context: PlanContext
    @ScreenModel private var model: RunSheetModel
    init(context: PlanContext) {
      self.context = context
      _model = ScreenModel { app in RunSheetModel(queries: app.queries, context: context) }
    }
    var body: some View { list.queryLifecycle(model.items) }
  }
  ```

- Call `.queryLifecycle(state1, state2)` on the screen that holds `QueryState`s, so returning to it revalidates stale data and invalidations skip covered screens.
- Dates: `@Environment(\.orgTimeZone) private var timeZone`, then `OrgCalendar.label(date, timeZone: timeZone, style: .weekdayMonthDay)` or the other `Logic/Calendar` helpers. Outside views, `app.timeZone` or `await app.queries.resolveOrganizationTimeZone()`. Never the device zone.
- "Now": `app.clock.now` (or `@Environment(\.appClock)`), never `Date()`, for anything labeled relative to today, so fixed-clock screenshots line up with the fixtures.
- Errors: writes through `queries.write` toast automatically. For anything else, `app.showError(error)` (or `toasts.showError(message)`). Reads show their own error state with Retry. No success toasts.
- Abilities: `app.capabilities` (`AppCapabilities`): `isEnabled(.people)`, `isEnabled(.chordCharts)`, `isReadOnly` (demo: hide or disable writes), `canSearchPeople`, `canSendFeedback`, `hasNoServicesAccess`, and the raw `access` snapshot. Per service type abilities come from the `serviceTypeAbilities` port (ios/logic-access) fed with `capabilities.access`.

### Navigation

- Root: `TabView` with Services, People (`people` flag), Songs (`chordCharts` flag), and `Tab(role: .search)`; `.sidebarAdaptable` (iPad sidebar headed by the brand lockup), `.tabBarMinimizeBehavior(.onScrollDown)`. Each tab owns a `NavigationStack` bound to `AppRouter`; the avatar on every tab root opens the account sheet.
- `AppRoute` (`App/Routing/AppRoute.swift`) is the only route type, and `appRouteDestinations()` maps every case in every tab, behind its flag: `.plan(PlanRoute)`, `.assign(PlanRoute, teamId:, positionId:)`, `.person(id:, month:)`, `.song(id:)`, `.chordChart(songId:, arrangementId:)`.
- Push with `@Environment(AppRouter.self) private var router` and `router.push(route)` (stays in the current tab: a person opened from the lineup returns to the lineup). `router.open(route, visibleTabs: app.visibleTabs)` switches to the owning tab (deep links, cross-section jumps). Also `pop()`, `popToRoot()`, `show(tab, path:)`, `presentAccount()`.
- While a plan is open in Services and another tab shows, a "back to plan" accessory sits above the tab bar (iOS 26.1 and later). It reads the plan header from the cache key `planDetails`, so load plan headers with that key.
- Screen events: tab roots and pushed routes send `$screen` with the web route template automatically; `PlanScreen` sends `.trackScreen(.plan(segment.view))`. Never send ids.

### Plan screen contract

- `PlanScreen(route: PlanRoute)` builds a `PlanContext` (`Features/Plan/PlanContext.swift`) and shows a segmented control (Overview, Lineup, Plan, Times) pinned under the navigation bar. No page swipe between segments (rows use swipe actions).
- Segment views take the context: `PlanOverviewView(context:)`, `LineupView(context:)`, `RunSheetView(context:)`, `PlanTimesView(context:)`. `PlanContext` has `serviceTypeId`, `planId`, `segment` (set it to switch), `plan` (`QueryState<Plan?>` for `catalog.plan`), `header`, `isMissing`, `route`, and `assignRoute(teamId:positionId:)`. Add fields freely; never rename or remove them.
- Assign is a push, never a segment: `router.push(context.assignRoute(teamId: team.id, positionId: position.id))`, rendered by `AssignView(route:teamId:positionId:)`.
- Other fixed initializers: `ServicesHomeView()`, `PeopleHomeView()`, `PersonDetailView(personId:month:)`, `SongsHomeView()`, `SongDetailView(songId:)`, `ChordChartEditorView(songId:arrangementId:)`, `SearchHomeView()`, `AccountSheet()`.

### Haptics and motion

- `.haptic(.success, trigger:)` when a write the person made lands (assigned, confirmed, saved), `.selection` for segment and status switches, `.tap` for reorder drops, `.warning` for declines; error toasts play `.error` themselves.
- Animate layout, never color; wrap animations in `Motion.respecting(reduceMotion:...)`.

### Debug launch arguments

Debug builds only (Release ignores them). Pass with `xcrun simctl launch <udid> com.pcobooster.ios.debug <args>` or `XCUIApplication.launchArguments`.

| Argument | Effect |
| --- | --- |
| `-PCOBMock YES` | Fixtures through `MockTransport`, signed in as Jordan Hale (Cedar Grove Church) with a second remembered account. |
| `-PCOBMockSession signedIn\|signedOut\|expired\|demo` | The mock session to start in (default `signedIn`). Sign-in in mock mode signs in as Jordan. |
| `-PCOBMockLatency <ms>` | Mock reply delay (default 250; UI tests use 0). |
| `-PCOBFeatures all\|none\|people\|songs` | Overrides `features.status` in mock mode (`none` is production today). |
| `-PCOBFixedNow YES` | Pins the mock data and `app.clock` to `MockFixtures.anchorNow` (Thu Oct 1 2026, 10 AM Pacific). |
| `-PCOBRoute <path>` | Opens a path at launch, for example `/services/1101/plans/881261004/lineup`, `/services/1101/plans/881261004/assign`, `/people/4100104`, `/songs/5501`, `/songs/5501/chart`, `/account`. |
| `-PCOBTab services\|people\|songs\|search` | Selects a tab at launch. |
| `-PCOBAppearance light\|dark` | Forces the appearance for this launch. |
| `-PCOBGallery YES` | Shows the design system gallery instead of the app. |
| `-PCOBOffline YES` | Shows the offline banner (requests still go out). |

Screenshot recipe: `xcrun simctl launch <udid> com.pcobooster.ios.debug -PCOBMock YES -PCOBFixedNow YES -PCOBRoute /services/1101/plans/881261004/lineup`, then `xcrun simctl io <udid> screenshot shot.png`. Toggle `xcrun simctl ui <udid> appearance dark` and `content_size accessibility-extra-large` for dark mode and Dynamic Type.

### Links and sign-in

- `onOpenURL` accepts `<scheme>://demo/<key>` and `https://pcobooster.com/demo/<key>` plus the app paths above (`AppLink`); anything else is ignored. A demo link while signed in asks first. The sign-in screen's "Have a demo link?" takes a pasted link or key; keys are never compiled in.
- Native sign-in runs in an ephemeral `ASWebAuthenticationSession` through SwiftUI's `webAuthenticationSession` environment, with the `PCOBURLScheme` callback.

### Analytics

`PostHogAnalytics` adapts the runtime's `AnalyticsSink`. It sets PostHog up only in a production build against `pcobooster.com` with a `PCOBPostHogKey`, after a non-demo `accounts.list`, identified by the Better Auth user id (as on the web). No autocapture, lifecycle or screen autocapture, session replay, surveys, or flag calls. "Share usage analytics" in the account sheet opts out.

### UI tests

`PCOBoosterUITests` launch on mock data (`XCUIApplication.mock(session:arguments:)`). Set `TEST_RUNNER_PCOB_SHOT_DIR=<dir>` to save each checkpoint's screenshot. Run with `bun run ios:test --ui` or `xcodebuild test -scheme PCOBooster -destination 'platform=iOS Simulator,id=<udid>' -derivedDataPath apps/ios/build/<yours>`.

## Talking to the API

- Every call is `POST <base>/api/rpc/<namespace>/<procedure>` with JSON body `{"json": input}` (`{}` for procedures without an input). Responses are `{"json": output, "meta": [...]}`; ignore `meta`. Errors are `{"json": {"defined", "code", "status", "message", "data"}}`; show `data.message` when present.
- Use generated descriptors only: `client.call(RPC.People.positionCandidates, input)`.
- Base URL: `https://pcobooster.com` in Release; Debug defaults to `http://127.0.0.1:3001` (the local `bun run dev` product origin) and can switch environments in the Debug menu.
- The session is a bearer token (`Authorization: Bearer <token>`) from native sign-in, stored in the Keychain. `URLSession` must be cookieless (`httpCookieStorage = nil`, `httpShouldSetCookies = false`): any cookie on a Better Auth POST without an Origin is refused.
- Headers: `x-pcobooster-account` (selected Planning Center account), `x-pcobooster-priority: speculative` on prefetches, `x-pcobooster-client: ios/<build>`.
- Dates go over the wire as `toISOString()` strings (`JSONCoding`). Format every congregation date in the org time zone from `catalog.organization`, never the device zone.

## Request budget

Web and iOS share one Planning Center limit (100 requests per 20 seconds per user) and each procedure stays under 40 Planning Center requests. Follow every continuation cursor the API returns, keep progressive batches at the web's sizes (16 people per batch, 2 in flight), treat a call that makes no progress as an error, and prefetch only on clear intent (a tap, or a deliberate long press), never on scroll or row appearance. Speculative work waits for interactive work and is sent with the speculative priority header.

## Version skew

An installed build lives for weeks against a continuously deployed API. Generated models decode unknown enum values as `.unknown(String)` and tolerate absent optional keys. On the server side, add contract output fields as optional and never rename or remove fields or enum cases without shipping a client that tolerates it first.

## Swift conventions

- Swift 6 language mode. The app target defaults to `@MainActor` isolation (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`); `PCOBoosterCore` is nonisolated, so its types are `Sendable` values, actors, or explicitly isolated. Network, cache, and disk work runs off the main actor (`@concurrent` or actors).
- State lives in `@Observable` models injected through the environment; views stay thin.
- Value types for models; no force unwraps outside tests and static literals.
- Strings: no en or em dashes anywhere in the repo (a lint scans every tracked file). Write "to" for ranges and use commas or periods in copy. When code must handle the characters, use `"\u{2013}"` in Swift and `String.fromCodePoint(0x20_13)` in TypeScript (the formatter turns `\u2013` escapes in TypeScript literals into real dashes).
- Tests use Swift Testing (`import Testing`), colocated under `PCOBoosterCore/Tests`.

## Design rules

- Colors come from the asset catalog tokens (`DesignSystem/Colors.swift`), never literals. Light and dark both ship.
- Liquid Glass belongs on the control layer only: tab bar, toolbars, segmented switchers, floating action bars, partial-height sheets, menus. Content surfaces stay solid.
- Selection, highlight, and press colors change instantly; animate layout and position, not color. Respect Reduce Motion everywhere.
- On iPhone, sheet actions (including destructive ones like Remove) are full-width buttons at the bottom of the sheet.
- Edits persist when the editor closes (swipe down, tap outside, Return where natural). No success toasts; errors always surface.
- Songs: show facts (history, keys, tempo), never suggestions or rankings.
- iPad uses the same features with adaptive layouts (`.sidebarAdaptable` tabs, split views, wider sheets).

## Testing against real data

`bun run dev` signs the local API in with a real Planning Center account, so every write from the simulator is a real write. Develop and screenshot against `MockTransport` (`-PCOBMock YES`). When checking against the local API, stay on the account owner's own test plan and never perform destructive actions (remove, unschedule, delete) on real plans.
