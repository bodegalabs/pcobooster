# iOS app (apps/ios)

Native SwiftUI app for pcobooster.com on iOS 26 (iPhone and iPad), built on the same oRPC API as the web product. Read the root `AGENTS.md` first; every product rule there (org time zone, request budget, autosave on close, no success toasts, instant color changes, inform rather than recommend songs) applies here too.

## Layout

- `PCOBooster.xcodeproj`: hand-written, folder-synced (objectVersion 77). New files under `PCOBooster/` and `PCOBoosterUITests/` join their target automatically; do not add file references to the project. The shared scheme is `PCOBooster`.
- `PCOBooster/`: the app target. `App/` (entry, app model, routing), `DesignSystem/` (tokens, components, motion), `Features/<Area>/` (one folder per product area), `Resources/` (`Assets.xcassets`, `AppIcon.icon`, `PrivacyInfo.xcprivacy`), `Info.plist`.
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
- `bun run ios:release`: archive and upload to TestFlight (see `scripts/release.sh`).
- Build into `apps/ios/build/` (ignored) with `-derivedDataPath`, never the default DerivedData, so worktrees do not collide.

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
