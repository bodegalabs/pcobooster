# Expo and Effect RPC migration

Status: implementation in progress. This document is the cutover inventory and acceptance checklist, not a completion claim.

## Plan and ownership

1. Inventory the current procedures and Swift workflows before deleting either implementation.
2. Contracts agent owns `packages/contracts`: native Effect Schema and ProductRpc, named procedure tags, declared errors.
3. Server agent owns API transport and API Worker: native Effect RPC buffered JSON over HTTP, explicit request dependencies/accounting, ordinary Better Auth/health/version HTTP.
4. Mobile agent owns `apps/mobile`: Expo Router, native screens, secure credentials, lifecycle and local release scripts.
5. Orchestrator owns `packages/client`, web cutover, synthetic verification integration, dependency lock, CI/docs/cleanup and final acceptance. Integration depends on the contracts; mobile and web depend on shared client, and workerd acceptance depends on server composition.
6. Run independent review after integration, resolve findings, run CI/build and actual browser/simulator flows, commit and bind proof to current head/base before opening PR. No merge, deployment or store upload is authorized.

Catalog: inspected today's Codex provider/model catalog (`models_cache.json`, fetched 2026-10-05) and tool-supported model definitions before delegation. Agents inherit the active model. T3 preview/device/model tools are not exposed in this Codex session; use installed browser and simulator tooling.

## Target boundaries

- `packages/contracts`: browser/native safe Effect Schema DTOs and ProductRpc, declared RpcError, request-priority constants; no server imports.
- `packages/client`: actual Effect RpcClient HTTP protocol, Promise boundary for TanStack Query, shared request scheduler/query keys/retry helpers; no platform storage/UI.
- `packages/planning-center-models`: existing pure calendar/scheduling/domain behavior shared unchanged.
- `packages/api`: existing Effect applications and capabilities, typed injected Server/RequestContext, Planning Center adapters; thin Effect RPC handlers.
- `apps/server`: Alchemy v2 Cloudflare Worker, D1/Drizzle/KV/Flagship/Access preserved; configuration startup and request runtime.
- `apps/web`: TanStack Start/Query and shadcn remain, consumes ProductRpc through shared client.
- `apps/mobile`: Expo/React Native with platform UI, Expo Router, SecureStore and native browser OAuth; bundle `com.pcobooster.ios`.
- `apps/marketing`, secrets management and database schema remain unchanged by this cutover.

## Pinned API verification

The implementation uses Effect and platform adapters `4.0.1`, Alchemy `2.0.0-beta.81`, Expo `57.0.26`, React Native `0.86.3`, React `19.2.3`, and `babel-preset-expo` `57.0.13`. The Bun lockfile pins the resolved graph. These pins replace the initially validated Effect RC / Expo 55 graph following the latest-version request. Source and integration validation must be repeated for the new pins; historical native builds are not acceptance evidence for SDK 57. The relevant exported APIs and source boundaries are:

- `effect/src/rpc/RpcServer.ts`: `toHttpEffect`, buffered HTTP framing, request interruption and server runtime ownership; the actual Worker stack runs through workerd tests.
- `effect/src/rpc/RpcClient.ts` and `RpcSerialization.ts`: `layerProtocolHttp`, `RpcClient.make`, `layerJson` array framing, decoded errors and cancellation. Shared-client-to-real-API regression tests cover the wire shape, not just hand-crafted requests.
- `effect/src/Schema.ts` and `unstable/rpc/Rpc.ts`: payload constructors, decoded success schemas, JSON codecs, defaults/optional keys and tagged declared errors. Every fictional procedure output is decoded through its native contract; hydrated query data is checked against decoded schemas.
- `alchemy/src/Cloudflare/Workers/Worker.ts` and `Cloudflare/D1/Database.ts`: existing Worker/resource, binding and migration composition preserved; no infrastructure apply or schema migration.
- Expo SDK 57 prebuild, config plugins, SecureStore, browser session and Router source: supported React/RN dependency matrix, `.icon` asset handling, privacy manifests, Babel discovery, native callback and local generated-project builds. `.babelrc` is used because the pinned Expo loader discovers it; no dependency patch is needed.
- Earlier SDK 55 ad hoc signed simulator builds verified native modules, Keychain cold restoration and actual HTTP cancellation against a real Node fixture with an independently checked disconnect oracle. SDK 57 requires Xcode 26.4+; installed Xcode 26.3 on macOS Sequoia 15.7.4 is unsupported. The user approved preparing Tahoe 26.7.1 and will install/restart; repeat native builds and simulator verification after updating Xcode. CI selects Xcode 26.6 on the macOS 26 runner.

The earlier SDK 55 Hermes runtime lacked the immutable array methods used by the shared rules. The native entry loads pinned `core-js` 3.50.0 standard `toSorted` and `toReversed` polyfills before Expo Router, following its [modular entry point documentation](https://github.com/zloirock/core-js/blob/master/README.md). The earlier actual simulator verified the polyfill boundary; SDK 57 runtime verification remains pending. The native query lifecycle and HTTP client use portable Effect/JavaScript primitives; no Hermes dependency on `Promise.withResolvers`, `DOMException`, or browser `atob` remains. Local xcodebuild/Gradle scripts provide the free fallback for the stack document's unidentified `rnd` reference.

## Procedure and consumer inventory

Health becomes ordinary HTTP. Every product procedure below must remain represented in ProductRpc and mapped to one application implementation. Consumers listed are the source inventory before cutover.

| Procedure | Contract | Web consumers | Swift consumers |
| --- | --- | --- | --- |
| `neededPositions.adjust` | `packages/contracts/src/needed-positions.ts` | `apps/web/src/hooks/use-adjust-needed-positions.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Plan/Lineup/Scheduling/NeededSlotsAdjuster.swift` |
| `planTimes.list` | `packages/contracts/src/plan-times.ts` | `apps/web/src/hooks/use-plan-times.ts` | `apps/ios/PCOBooster/Features/Services/AgendaPlanPreview.swift`, `apps/ios/PCOBooster/Features/Plan/Shell/PlanShellModel.swift`, `apps/ios/PCOBooster/Features/Plan/Times/PlanTimesModel.swift`, `apps/ios/PCOBooster/Features/Plan/Overview/PlanOverviewModel.swift`, `apps/ios/PCOBooster/Features/Plan/Lineup/Person/LineupPersonEditor.swift` |
| `planTimes.create` | `packages/contracts/src/plan-times.ts` | `apps/web/src/hooks/use-times-tab-controller.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Plan/Times/PlanTimesModel.swift` |
| `planTimes.update` | `packages/contracts/src/plan-times.ts` | `apps/web/src/hooks/use-times-tab-controller.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Plan/Times/PlanTimesModel.swift` |
| `planTimes.delete` | `packages/contracts/src/plan-times.ts` | `apps/web/src/hooks/use-times-tab-controller.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift`, `apps/ios/PCOBooster/Features/Plan/Times/PlanTimesModel.swift` |
| `demo.start` | `packages/contracts/src/demo.ts` | `apps/web/src/components/demo/demo-entry.tsx` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Session/SessionStore.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBooster/App/MockServices.swift` |
| `demo.exit` | `packages/contracts/src/demo.ts` | `apps/web/src/hooks/use-account-panel.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Session/SessionStore.swift` |
| `chordCharts.song` | `packages/contracts/src/chord-charts.ts` | `apps/web/src/hooks/use-chord-chart-song.ts` | `apps/ios/PCOBooster/Features/Songs/ChordChart/ChordChartWorkspaceModel.swift`, `apps/ios/PCOBooster/Features/Songs/ChordChart/ChordChartEditorModel.swift`, `apps/ios/PCOBooster/Features/Songs/Library/SongLibraryList.swift`, `apps/ios/PCOBooster/Features/Songs/Detail/SongDetailModel.swift` |
| `chordCharts.update` | `packages/contracts/src/chord-charts.ts` | `apps/web/src/hooks/use-chord-chart-song.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Songs/ChordChart/ChordChartWorkspaceModel.swift` |
| `chordCharts.create` | `packages/contracts/src/chord-charts.ts` | `apps/web/src/hooks/use-chord-chart-song.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Songs/ChordChart/ChordChartArrangementSheet.swift` |
| `chordCharts.createSong` | `packages/contracts/src/chord-charts.ts` | `apps/web/src/hooks/use-chord-chart-song.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Songs/Library/AddSongSheet.swift` |
| `chordCharts.pdf` | `packages/contracts/src/chord-charts.ts` | `apps/web/src/hooks/use-chord-chart-song.ts` | `apps/ios/PCOBooster/Features/Songs/Shared/ChordChartPDF.swift` |
| `chordCharts.lyricsSearch` | `packages/contracts/src/chord-charts.ts` | `apps/web/src/hooks/use-chord-chart-song.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift`, `apps/ios/PCOBooster/Features/Songs/ChordChart/ChordChartImportSheet.swift` |
| `planPeople.updateTimes` | `packages/contracts/src/plan-people.ts` | `apps/web/src/lib/workflow-analytics.ts`, `apps/web/src/components/schedule/plan-person-edit-dialog.tsx` | `apps/ios/PCOBooster/Features/Plan/Lineup/Scheduling/RosterScheduleWriter.swift` |
| `schedule.assign` | `packages/contracts/src/schedule.ts` | `apps/web/src/hooks/use-schedule-plan-person.ts`, `apps/web/src/lib/workflow-analytics.ts`, `apps/web/src/lib/workflow-analytics.test.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBooster/Features/Plan/Lineup/Scheduling/RosterScheduleWriter.swift` |
| `schedule.remove` | `packages/contracts/src/schedule.ts` | `apps/web/src/hooks/use-unschedule-plan-person.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Plan/Lineup/Scheduling/RosterScheduleWriter.swift` |
| `schedule.updateStatus` | `packages/contracts/src/schedule.ts` | `apps/web/src/hooks/use-update-plan-person-status.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Plan/Lineup/Scheduling/RosterScheduleWriter.swift` |
| `people.positionCandidates` | `packages/contracts/src/people.ts` | `apps/web/src/hooks/use-position-candidates.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift`, `apps/ios/PCOBooster/Features/Plan/Assign/Pipeline/AssignCandidatePipeline.swift`, `apps/ios/PCOBooster/Features/Plan/Lineup/Person/LineupPersonEditor.swift` |
| `people.planWindowHistory` | `packages/contracts/src/people.ts` | `apps/web/src/hooks/use-position-candidates.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Loading/Continuation.swift`, `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/API/Runtime/RPCClient.swift`, `apps/ios/PCOBooster/Features/Plan/Assign/Pipeline/AssignCandidatePipeline.swift` |
| `people.candidateDetails` | `packages/contracts/src/people.ts` | `apps/web/src/hooks/use-position-candidates.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Loading/Continuation.swift`, `apps/ios/PCOBooster/Features/Plan/Assign/Pipeline/AssignCandidatePipeline.swift` |
| `people.search` | `packages/contracts/src/people.ts` | `apps/web/src/hooks/use-people-search.ts` | `apps/ios/PCOBooster/Features/Search/SearchModel.swift`, `apps/ios/PCOBooster/Features/Plan/Assign/SomeoneElse/AssignSomeoneElseSheet.swift` |
| `people.blockouts` | `packages/contracts/src/people.ts` |  | `apps/ios/PCOBooster/Features/Search/SearchOpener.swift`, `apps/ios/PCOBooster/Features/Search/SearchPersonSheet.swift`, `apps/ios/PCOBooster/Features/People/Models/PersonDetailModel.swift` |
| `people.dashboardRoster` | `packages/contracts/src/people.ts` | `apps/web/src/hooks/use-people-dashboard.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/ScreenModels/Sources/PeopleDashboardModel.swift`, `apps/ios/PCOBooster/Features/People/Models/PeopleDashboardModel.swift` |
| `people.dashboardActivity` | `packages/contracts/src/people.ts` | `apps/web/src/hooks/use-people-dashboard.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/ScreenModels/Sources/ActivityBatch.swift`, `apps/ios/PCOBooster/Features/People/Models/ActivityBatch.swift` |
| `people.dashboardPerson` | `packages/contracts/src/people.ts` | `apps/web/src/hooks/use-people-dashboard-person.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/ScreenModels/Sources/PeopleDashboardModel.swift`, `apps/ios/PCOBooster/Features/People/Models/PersonDetailModel.swift`, `apps/ios/PCOBooster/Features/People/Models/PeopleDashboardModel.swift` |
| `people.myScheduledPlans` | `packages/contracts/src/people.ts` | `apps/web/src/hooks/use-my-scheduled-plans.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/ScreenModels/Sources/ServicesHomeModel.swift`, `apps/ios/PCOBooster/Features/Services/ServicesHomeModel.swift` |
| `planItems.list` | `packages/contracts/src/plan-items.ts` | `apps/web/src/hooks/use-plan-items.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Query/QueryClient.swift`, `apps/ios/PCOBooster/Features/Services/AgendaPlanPreview.swift`, `apps/ios/PCOBooster/Features/Plan/Shell/PlanShellModel.swift`, `apps/ios/PCOBooster/Features/Plan/RunSheet/RunSheetModel.swift`, `apps/ios/PCOBooster/Features/Plan/Overview/PlanOverviewModel.swift` |
| `planItems.create` | `packages/contracts/src/plan-items.ts` | `apps/web/src/hooks/use-plan-tab-controller.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Plan/RunSheet/RunSheetModel+Writes.swift` |
| `planItems.update` | `packages/contracts/src/plan-items.ts` | `apps/web/src/hooks/use-plan-tab-controller.ts`, `apps/web/src/lib/workflow-analytics.ts`, `apps/web/src/lib/workflow-analytics.test.ts` | `apps/ios/PCOBooster/Features/Plan/RunSheet/RunSheetModel+Writes.swift` |
| `planItems.delete` | `packages/contracts/src/plan-items.ts` | `apps/web/src/hooks/use-plan-tab-controller.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Query/QueryClient.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Query/QueryClientTests.swift`, `apps/ios/PCOBooster/Features/Plan/RunSheet/RunSheetModel+Writes.swift` |
| `planItems.reorder` | `packages/contracts/src/plan-items.ts` | `apps/web/src/hooks/use-plan-tab-controller.ts`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/Features/Plan/RunSheet/RunSheetModel+Writes.swift` |
| `songs.search` | `packages/contracts/src/songs.ts` | `apps/web/src/hooks/use-song-search.ts` | `apps/ios/PCOBooster/Features/Search/SearchModel.swift`, `apps/ios/PCOBooster/Features/Plan/RunSheet/SongPaletteModel.swift`, `apps/ios/PCOBooster/Features/Songs/Library/AddSongSheet.swift` |
| `songs.suggestions` | `packages/contracts/src/songs.ts` | `apps/web/src/hooks/use-song-suggestions.ts` | `apps/ios/PCOBooster/Features/Plan/RunSheet/SongPaletteModel.swift` |
| `songs.library` | `packages/contracts/src/songs.ts` | `apps/web/src/hooks/use-song-library.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift`, `apps/ios/PCOBooster/Features/Songs/Library/SongLibraryModel.swift` |
| `songs.history` | `packages/contracts/src/songs.ts` | `apps/web/src/hooks/use-song-history.ts` | `apps/ios/PCOBooster/Features/Plan/RunSheet/SongReads.swift`, `apps/ios/PCOBooster/Features/Songs/Library/SongLibraryList.swift`, `apps/ios/PCOBooster/Features/Songs/Detail/SongDetailModel.swift` |
| `songs.options` | `packages/contracts/src/songs.ts` | `apps/web/src/hooks/use-song-options.ts` | `apps/ios/PCOBooster/Features/Plan/RunSheet/RunSheetModel.swift`, `apps/ios/PCOBooster/Features/Plan/RunSheet/SongPaletteModel.swift`, `apps/ios/PCOBooster/Features/Plan/RunSheet/SongReads.swift`, `apps/ios/PCOBooster/Features/Plan/RunSheet/PlanItemDetailView.swift`, `apps/ios/PCOBooster/Features/Songs/Detail/SongDetailModel.swift` |
| `features.status` | `packages/contracts/src/features.ts` | `apps/web/src/server/features.functions.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift`, `apps/ios/PCOBooster/App/MockServices.swift`, `apps/ios/PCOBooster/App/AccountContext.swift` |
| `session.status` | `packages/contracts/src/session.ts` | `apps/web/src/server/server-rpc.test.ts`, `apps/web/src/server/session.functions.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Session/SessionStore.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift` |
| `access.me` | `packages/contracts/src/access.ts` | `apps/web/src/hooks/use-planning-center-access.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/API/Runtime/RPCClient.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Session/SessionStoreTests.swift`, `apps/ios/PCOBooster/App/AccountContext.swift` |
| `feedback.submit` | `packages/contracts/src/feedback.ts` | `apps/web/src/components/sidebar-feedback.tsx`, `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBooster/App/AppModel.swift` |
| `accounts.list` | `packages/contracts/src/accounts.ts` | `apps/web/src/hooks/use-account-panel.ts` | `apps/ios/PCOBooster/App/AppModel.swift`, `apps/ios/PCOBooster/App/AccountContext.swift` |
| `accounts.select` | `packages/contracts/src/accounts.ts` | `apps/web/src/lib/workflow-analytics.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Session/SessionStore.swift` |
| `catalog.serviceTypes` | `packages/contracts/src/catalog.ts` | `apps/web/src/hooks/use-service-types.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Config/AppConfigurationTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Query/QueryClientTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/ScreenModels/Sources/ServicesHomeModel.swift`, `apps/ios/PCOBooster/Features/Search/SearchCatalog.swift`, `apps/ios/PCOBooster/Features/Services/ServicesHomeModel.swift`, `apps/ios/PCOBooster/Features/Plan/Shell/PlanShellModel.swift`, `apps/ios/PCOBooster/Features/Plan/RunSheet/SongReads.swift`, `apps/ios/PCOBooster/Features/Songs/Detail/SongDetailModel.swift` |
| `catalog.plans` | `packages/contracts/src/catalog.ts` | `apps/web/src/hooks/use-plans.ts`, `apps/web/src/hooks/use-service-plan-selection.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/API/Runtime/RPCClient.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/ScreenModels/Sources/ServicesHomeModel.swift`, `apps/ios/PCOBooster/Features/Search/SearchCatalog.swift`, `apps/ios/PCOBooster/Features/Services/ServicesHomeModel.swift`, `apps/ios/PCOBooster/Features/Plan/Shell/PlanShellModel.swift` |
| `catalog.plan` | `packages/contracts/src/catalog.ts` | `apps/web/src/hooks/use-plans.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Runtime/RPCClientTests.swift`, `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/API/ProcedureDescriptorTests.swift`, `apps/ios/PCOBooster/Features/Plan/PlanContext.swift`, `apps/ios/PCOBooster/Features/Search/SearchOpener.swift`, `apps/ios/PCOBooster/Features/Plan/Assign/AssignModel.swift` |
| `catalog.adjacentPlans` | `packages/contracts/src/catalog.ts` | `apps/web/src/hooks/use-plans.ts` | `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/ScreenModels/Sources/ServicesHomeModel.swift`, `apps/ios/PCOBooster/Features/Services/ServicesHomeModel.swift`, `apps/ios/PCOBooster/Features/Plan/Shell/PlanShellModel.swift` |
| `catalog.organization` | `packages/contracts/src/catalog.ts` | `apps/web/src/hooks/use-organization-timezone.ts` | `apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Query/OrganizationTimeZone.swift` |
| `catalog.teamPositions` | `packages/contracts/src/catalog.ts` | `apps/web/src/hooks/use-team-positions.ts` | `apps/ios/PCOBooster/Features/Services/AgendaPlanPreview.swift`, `apps/ios/PCOBooster/Features/Plan/Shell/PlanShellModel.swift`, `apps/ios/PCOBooster/Features/Plan/Times/PlanTimesModel.swift`, `apps/ios/PCOBooster/Features/Plan/Lineup/LineupModel.swift`, `apps/ios/PCOBooster/Features/Plan/Assign/AssignModel.swift`, `apps/ios/PCOBooster/Features/Plan/Overview/PlanOverviewModel.swift` |

Inventoried 48 procedures.

## Behavior invariants

- Better Auth web cookies and native signed bearer session tokens, PKCE S256 + single-use exchange, exact callback/state validation, cancellation, expiry/logout; account and demo headers remain honored before cookies. Never persist credentials in query data or URLs.
- Per procedure Planning Center cap 40 including retries, progressive budget 36, pacing and speculative header, info procedure summaries; retain all continuation fields/no-progress guard and actionable retryAfterSeconds.
- Read AbortSignal must interrupt RPC/Effect/provider fetch and cache waiters. Provider writes check caller state before starting, then await actual provider completion plus invalidation/audit.
- Client query lifecycle uses TanStack Query; credential/account/demo/version/namespace persistence isolation, invalidation and visible-screen loading; preserve 16-person batches and at most two progressive calls.
- Cache loads isolated by request under workerd, complete values only, credential-hash scopes, shared KV constraints; mutations invalidate the right account data.
- Explicit congregation IANA zone for all calendar dates, full ISO plan instant for blockouts, distinct service/rehearsal calendar days for frequency and existing candidate scoring.
- Scheduling mutation verification must use an isolated synthetic Planning Center adapter. Presentation mode is not a sandbox.
- No sockets, paid build service, release upload, store submission, secrets migration or marketing framework change.

## Swift workflow inventory

Detailed source inventory is maintained by the mobile owner at `apps/mobile/MIGRATION.md`. Current shell has Services, People, Songs, Search and Account; feature flags hide People/Songs and demo hides writes. Each tab preserves a navigation stack; plan screens have Overview, Lineup, Plan, Times, with Assign pushed separately. People and Song details can be reached across tabs. Account supports remembered accounts, organization switching, appearance, feedback, sign-out. Keep deep links and app resume/offline handling.

## Acceptance checklist

- [x] Every inventoried procedure has Effect Schema payload/success and declared errors.
- [x] Server handlers map to existing Effect application programs and preserve capabilities/accounting/logs.
- [x] All web consumers use shared Effect RPC; existing query persistence/invalidation preserved.
- [ ] Native workflows and meaningful interactions reproduced and documented individually.
- [ ] Secure OAuth, expiry, cancellation, logout/account/demo boundaries verified.
- [ ] Native persistence isolation, navigation, keyboard/safe areas/accessibility/lifecycle verified.
- [x] Synthetic mutation adapter verifies scheduling and invalidation without live writes.
- [x] Exact pinned Effect/Alchemy/Expo/RN APIs verified against docs/source; free reproducible build path.
- [x] Focused boundary regressions and retained high-value tests pass.
- [x] `bun run ci` and `bun run build` pass.
- [ ] Actual web flows and iOS simulator verified with media; Android status explicit.
- [ ] Release build validation recorded separately from simulator and real device verification.
- [x] Swift/generation/parity/oRPC/unused Hono tooling removed, fixtures ported.
- [x] Root/nested instructions and API/auth/dev/release docs/scripts/CI reflect final system.
- [ ] Independent final review resolved.
- [ ] Revision-bound proof verified and published for attached PR(s).

## Verification and limitations

Current Effect 4.0.1 / Alchemy beta.81 / Expo 57 graph passes `bun run ci` (1,964 tests across 12 test tasks) and `bun run build` (web, admin, marketing, iOS/Android Hermes exports). Expo prebuild generates both native projects without installing pods or compiling. The actual upgraded web app renders the protected-route sign-in gate without browser errors, and ordinary health returns JSON through the real Worker. Independent source review is PASS_WITH_NOTES with 259 focused checks. These results establish source and JavaScript compatibility, not a current SDK 57 native binary or release.

Installed Xcode 26.3 requires a macOS upgrade before SDK 57 native compilation. The user approved preparing Tahoe 26.7.1 and will install/restart; the first official installer download failed with an internal error, and the retry completed successfully, preparing `/Applications/Install macOS Tahoe.app`. No OS installation or restart was performed. The current OS remains Sequoia 15.7.4. SDK 55 simulator/cancellation screenshots and the unsigned release archive are historical only. Current SDK 57 native proof, release compilation, Android runtime and real-device verification remain pending.

No commit-bound final receipt, PR, deployment or store upload is claimed here. Final acceptance and proof publication resume after compatible native builds and review. Rollback is a coordinated revert of the cutover revision, restoring the former web/server/mobile code together; no database migration is planned.
