# Mobile diagnostics

The iPhone app (`apps/mobile`) reports JavaScript errors and terminal API failures to the same PostHog project as the web app (614621, [error tracking](https://us.posthog.com/project/614621/error_tracking)). It uses no other vendor. The app owns capture, consent, and delivery. PostHog's own `@posthog/core` exception builder (the one `posthog-react-native` uses) parses Hermes stacks, `posthog-react-native/metro` stamps each bundle with a debug ID, and `posthog-cli` uploads the matching Hermes source maps.

The `posthog-react-native` client is not used at runtime. Its opt-out only sets a flag, and its `reset()` keeps queued events, so an opted-out or demo report could still leave the device later. It also brings remote config, feature flags, surveys, push, and lifecycle capture that would all need turning off. The app sends events to `https://us.i.posthog.com/batch/` itself, and its persisted state is one small file it can delete.

## What is captured

| Source | How | Event |
| --- | --- | --- |
| Fatal JavaScript error, including during startup and module evaluation | `src/diagnostics/fatal-sentinel.ts` chains React Native's global handler | `$exception`, level `fatal`, sent on a later launch |
| Non-fatal uncaught error (`ErrorUtils.reportError`) | The sentinel | `$exception` |
| Unhandled promise rejection (Release builds only) | The sentinel holds Hermes' rejection tracker | `$exception` |
| Render error | The root `ErrorBoundary` (`app/_layout.tsx` → `render-failure.tsx`), which also shows Try Again | `$exception` |
| Terminal API failure | Per-scope query and mutation caches (`api-diagnostics.ts`) | See [API failures](#api-failures) |

`index.ts` imports the sentinel first. The sentinel imports nothing, so it is installed before the polyfills and before any app module. Diagnostics (`device-diagnostics.ts`) loads next, before the router. `startup-order.test.ts` checks the source order, and `ios:source-maps rehearse` checks it again in a built bundle. The sentinel never replaces React Native's handler. It offers each error to diagnostics and then forwards it to the previous handler in `finally`, synchronously, even if recording failed. A fatal still reaches React Native's crash path at once.

React Native reports a render error that no boundary catches as a soft exception and leaves a blank screen. The root boundary reports the error and offers a way back instead.

Every event carries `$app_version`, `$app_build`, `$app_namespace`, `$os_name`, `$os_version`, `source: expo`, `source_revision` (the archived Git SHA, `EXPO_PUBLIC_SOURCE_REVISION`), and `app_session_id`. That last one is a random ID for the app process, not stored except with a pending fatal. Events are identified by the Better Auth user ID, as on the web.

### Privacy

- Exceptions and frames are rebuilt from an allowlist (`sanitize.ts`). Kept fields are type, message, mechanism, and per frame the file name, function, line, column, `in_app`, and chunk ID. Source context, absolute paths, modules, and variables are dropped.
- Messages are filtered, then cut to 200 characters. Credentials go first, whatever their length or characters: the value after `Bearer`, `Basic`, or `Digest`, after a credential header (`Authorization`, `Cookie`, `x-pcobooster-demo`, `x-pcobooster-account`), and after a label such as `token`, `password`, `secret`, `api_key`, `signature`, or `session_id` (`token=…`, `"password": "…"`). Then URLs, emails, paths, UUIDs, long opaque strings (24 or more characters with a digit or base64 punctuation, or any 32), digit runs of four or more, quoted values longer than 24 characters, and JSON-looking values go. This is a filter, not a guarantee: a short unlabelled value inside a message can remain, so the app's own errors never put request data in messages, and API failures are reported with synthetic messages, never the server's answer (see [API failures](#api-failures)). A thrown non-error value is reported only as "A non-error value was thrown".
- Frame file names keep only their last segment (`main.jsbundle`), so the device's app-container path never leaves it.
- No replay, recordings, console capture, breadcrumbs, request or response bodies, headers, tokens, device names, or Planning Center data.

## Capture policy

Reports follow "Share usage analytics and error reports" (Account), which is on unless the person turned it off, and the session (`capture-policy.ts`, table-tested):

| Context | What happens |
| --- | --- |
| Development build, fixture mode, or no `EXPO_PUBLIC_POSTHOG_KEY` | Diagnostics is off. Nothing is kept. |
| Preference still being read | Held. |
| Opted out | Dropped, and everything held is deleted (memory and the pending-fatal file). |
| Demo or development session | Dropped, and everything held is deleted. |
| Session restoring, or signed out | Held. |
| Signed in, preference read, not opted out | Sent. |

A held report remembers whose context it was captured in. When sending opens for a user, their own reports are sent. Reports captured before anyone signed in are sent under that user, marked `captured_before_sign_in: true`. Reports captured for another account on the device are deleted. Opting out deletes everything held. The stored preference is read before anything can be sent, and it can only change through the UI after that, so a report from an opted-out period is deleted before anyone could opt back in.

Work that reports later is judged by the context it started in, not the one current when it fails. Each API call pins `Diagnostics.origin()` when it starts (after any wait behind the scheduler), and each mutation when it runs: whose report it would be, or none in a demo or opted-out context, and how many purges had happened. A late failure is dropped if its origin could not report, if a purge (opt-out, demo) happened since, or if it belongs to another account than the one now signed in. A request for account A that fails after a switch to B, a sign-out, or a demo is never reported in the new context. On top of that, each account scope has its own query cache and a client bound to that scope (`AppClients.forScope`): a cache whose scope the session has left reports nothing, and its calls, retries included, fail with `ScopeChangedError` before they are sent, so nothing for A carries B's credentials or lands in a cache B can see. A query failure that is not an API failure (a bug in query code) has no call to pin, so it is judged by the context when the cache reports it, within the same account scope.

Deleting a held report takes it back only until it is sent. A purge also aborts deliveries already in flight, but a request PostHog has already received cannot be retracted.

### Delivery

- **Fatals** are written synchronously to Caches (never backed up). They hold at most 3 reports of at most 16 KB each, kept up to 7 days. A crash loop raises a count (`repeat_count`) instead of filling slots. Reports are sent once sending opens, with their original timestamp, build, and revision. A report is deleted only after PostHog accepts it, and each is tried at most 5 times. Delivery is at least once, and the stored event UUID lets PostHog collapse a repeat.
- **Other reports** wait in memory (at most 10) and are lost with the process. A report that fails to send is not retried.
- **Deduplication:** one error object is reported once, whichever path sees it first. A fatal is always recorded, and it replaces a not-yet-sent report of the same error. Each fingerprint is sent at most once a minute, and each app session sends at most 25 reports.
- Nothing waits on the network in the app's path. Failures to report are swallowed.

The reports are kept twice, in `pcobooster-pending-fatals-a.json` and `-b.json` used in turn (`pending-fatals.ts`). Each write replaces the older copy with the complete list, numbered one past the newer, and reading takes the highest-numbered copy that decodes. `expo-file-system` writes in place (iOS `atomically: false`), and its `move` deletes an existing destination first, so neither one file nor a rename could promise this. A write cut short by the crash itself, a full disk, or the process ending damages at worst the older copy: the reports kept before survive, and only the change being written (the new fatal, a repeat count, a retry count) is lost. Purge first creates the empty `pcobooster-pending-fatals-purged` marker; its existence suppresses both copies regardless of their sequence. It deletes both copies before removing the marker. Partial deletion or process termination leaves the marker authoritative on restart, and a failed clear also disables persistent replay in that process until cleanup succeeds. Both copies are still removed if creating the marker fails. If the filesystem refuses both marking and deletion, no durable state can be committed: replay remains disabled in that process, but restart suppression depends on the saved opt-out preference. This storage failure is a limit of durable consent, not a successful purge. A fatal raised while `device-diagnostics.ts`'s own imports evaluate reaches React Native before a recorder exists and is not kept. React Native's crash handling is unchanged either way, and non-fatal reports still work.

### Native crashes

Native (Objective-C, Swift, C++) crashes are not captured by the app, and nothing here reports them to PostHog. They are collected by Apple only: Xcode Organizer and TestFlight crash reports, which the release export's `uploadSymbols` symbolicates. A JavaScript fatal produces both a PostHog `$exception` (level `fatal`) and Apple's `SIGABRT` report for the same launch. Join them by build number and time. Proving native crash collection needs an installed TestFlight build and Apple's crash reports, which is external to this repository. PostHog's native crash plugin (`@posthog/react-native-plugin` with dSYM upload) is a possible follow-up, not part of this change. #298 is not complete on JavaScript proof alone.

## API failures

Each query pins its diagnostics origin at the query cache's `fetch` action, once per logical execution rather than once per HTTP attempt. Automatic retries keep that origin; a new refetch gets a new one. Mutations pin at `onMutate`. The terminal call still supplies its own request ID and duration, but cannot override the operation's consent generation. Thus opt-out followed by opt-in does not revive a pending query or mutation's permission to report.

Each call through the app client sends a fresh `x-request-id`. Native builds also send `x-pcobooster-app: <version>(<build>)+<short revision>` (`packages/contracts/src/http/request-diagnostics.ts`), kept apart from `x-pcobooster-client: expo;api=2`, which is the API protocol version. The API keeps a request ID only if it matches `^[A-Za-z0-9-]{8,64}$` (otherwise it generates a UUID). It logs the release as `appRelease` on the one `rpc` outcome line, or null when the header is absent or malformed.

A failed call leaves its request ID, procedure, duration, and the diagnostics context it started in with its rejection. The query and mutation caches report terminal failures once, after the last automatic retry, under that context (see [Capture policy](#capture-policy)):

| Failure | Report |
| --- | --- |
| Cancelled or aborted; a call never sent because the account changed; speculative work nothing on screen asked for | Nothing |
| 4xx fault (sign-in, permission, validation, not found, conflict, rate limit) | Nothing |
| `ClientOutdated` | `api request failed`, once per app session |
| 5xx fault | `api request failed` with `request_id`. Not an exception, because the Worker already reports the same request as `$exception` (one Slack alert). |
| Network failure while the device reports a connection | `$exception` `ApiTransportError`, at most once per 5 minutes |
| Network failure while offline | Nothing |
| Undecodable answer | `$exception` `ApiDecodeError` |
| Any other error thrown from a query or mutation | `$exception` with the error itself, so bugs are not hidden |

API failures and cancellations reach diagnostics only through the caches. An unawaited `mutateAsync` rejection, an uncaught error, or the render boundary skips them, so an expected 4xx or an offline failure never becomes an exception there. A fatal is always recorded.

Details are `operation` (the procedure, such as `catalog.plans`), `error_code`, `http_status`, `request_id`, `duration_ms`, and `failure_kind`. Exception messages are synthetic (`catalog.plans failed (UNDECODABLE)`), fingerprinted `mobile-api:<procedure>:<code>`. Request priority, cancellation, pinned credentials, pacing, and the request budget are unchanged: the headers add no requests.

### Finding a mobile failure in Workers Logs

1. In PostHog, open the event (`api request failed`, or the `$exception` issue) and copy `request_id`, `$app_build`, and `source_revision`.
2. In Cloudflare Workers Logs for the production API Worker, filter `message = "rpc"` and `requestId = <request_id>`. Exactly one line answers. Its `appRelease` names the build, and it also has `status`, `code`, `durationMs`, and the Planning Center request counts.
3. For a 5xx, the Worker's own `$exception` in PostHog has the same `request_id`.
4. No line means the request never reached the API: a network failure, or an undecodable answer from something in between.

## Source maps

`metro.config.ts` uses `getPostHogExpoConfig`. Every bundle then ends with `//# debugId=<uuid>`, and `globalThis._posthogChunkIds` lets each frame carry that `chunk_id`. The packager map names the same ID, and Hermes bytecode keeps the string. React Native's compose step drops it, so `posthog-cli hermes clone` copies it into the composed map before upload. Maps upload in release mode `event`: each exception resolves its release from `$app_namespace`, `$app_version`, and `$app_build`.

Debug IDs alone cannot show that a composed map belongs to the bundle: before the clone the composed map carries no ID, and the clone gives the packager map's ID to whatever composed map it is handed. So the composition hook (`compose-source-maps.mjs`) writes `packager/provenance.json` beside its copy of the packager map: that map's debug ID and the SHA-256 of the packager map, Hermes's map, the composed map, and the Hermes bytecode it composed them for (react-native-xcode.sh writes the bytecode at the Hermes map's path without `.map`). `verify` refuses maps with no provenance, whose packager or composed map differs from it, whose composed map names another chunk ID, or whose archived `main.jsbundle` is not that bytecode. `upload` runs the same check before `hermes clone`, records the cloned map's hash in the provenance, and checks again (`--cloned`) before `hermes upload`; a re-run after a failed upload skips the clone. `provenance.json` is outside `hermes/`, so it is never uploaded.

`ios:source-maps rehearse --out <dir>` runs the pipeline without Xcode (Metro release bundle, React Native's `hermesc`, the compose hook) and checks the result, including the entry order and the provenance. A rehearsal or a successful upload does not show that a device's frames symbolicate; that needs an installed build (see [Verification](#verification)).

### Release integration contract

`scripts/release-ios.sh` is owned by the release work (#300, #306) and is not changed here. It does not run these steps yet: until it does, a release archive has no source maps in PostHog, and this contract is a required integration boundary for that work. Nothing in `node_modules` is patched and PostHog's Xcode wrapper is not used.

**Archive step** (no PostHog credentials in this environment). Export these for `xcodebuild archive`, alongside the existing `EXPO_PUBLIC_POSTHOG_KEY`:

| Variable | Value | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SOURCE_REVISION` | `$revision` (full SHA) | `source_revision` on events, `+<short>` in `x-pcobooster-app` |
| `SOURCEMAP_FILE` | `$out/maps/hermes/main.jsbundle.map` | React Native writes the composed Hermes map here |
| `COMPOSE_SOURCEMAP_PATH` | `$mobile/scripts/compose-source-maps.mjs` | Keeps the packager map React Native would delete |
| `PCOB_PACKAGER_SOURCEMAP_COPY` | `$out/maps/packager/main.jsbundle.map` | Where that copy goes |

Do not set `EXPO_PUBLIC_DIAGNOSTICS_PROBES` for a release (see [Verification builds](#verification-builds)).

**After the archive:**

1. `bun run --cwd apps/mobile ios:source-maps verify --maps "$out/maps" --bundle "$archive/Products/Applications/PCOBooster.app/main.jsbundle"`. This fails if the maps are missing, have no debug ID or no provenance, name no `apps/mobile/src/` sources, come from different composition runs, or belong to another bundle. Treat a failure as a failed release.
2. With `POSTHOG_CLI_API_KEY` and `POSTHOG_CLI_PROJECT_ID=614621` set for this command only (like the App Store Connect key): `bun run --cwd apps/mobile ios:source-maps upload --maps "$out/maps" --bundle <same>`. This requires `posthog-cli` 0.18.9 (`POSTHOG_CLI`, else on PATH; install with `bun add -g @posthog/cli@0.18.9 --trust`). It repeats step 1, runs `hermes clone`, records and checks the cloned map, then runs `hermes upload --release-mode event` against `https://us.posthog.com`. Any failure fails the release.
3. Keep `$out/maps` (with `packager/provenance.json`) beside the archive.

A personal API key scoped to project 614621 with error-tracking write access belongs in Infisical Production next to the other release credentials. It has not been created yet.

## Verification builds

Synthetic failures are proven on an internal verification build, never through production. There is no remote failure endpoint and no hidden control in the app. Archive a separate build the same way as a release, but with `EXPO_PUBLIC_DIAGNOSTICS_PROBES=1` in the archive environment. The flag is inlined at build time, so a normal release contains no active probe code (`diagnosticsProbe` is the constant `null`). Events from a verification build carry `verification_build: true`. Install it on a device and start one launch per probe:

```bash
xcrun devicectl device process launch --device <udid> com.pcobooster.ios -PCOBDiagnosticsProbe <kind>
```

| Kind | Effect | Expect in PostHog |
| --- | --- | --- |
| `handled` | Reports a handled `DiagnosticsProbeError` | `$exception`, level `error` |
| `rejection` | Leaves a promise rejection unhandled | `$exception`, mechanism `onunhandledrejection` |
| `render` | Throws once while rendering the root stack; Try Again recovers | `$exception`, mechanism `react-error-boundary` |
| `startup` | Throws while `index.ts` evaluates; the app terminates | On the next normal launch: `$exception`, level `fatal`, `captured_before_sign_in` |
| `api-5xx` | Each attempt of the launch's first `catalog.organization` read (the request and its one automatic retry) is sent, then answered with a synthetic 502 | One `api request failed`, `BAD_GATEWAY`, whose `request_id` (the retry's) finds the Worker's (200) `rpc` line |
| `api-undecodable` | Each attempt of the same read is sent, then answered with an HTML page | One `$exception` `ApiDecodeError` |
| `api-network` | Each attempt of the same read fails as a lost connection without being sent | One `$exception` `ApiTransportError`; no Worker line |
| `api-5xx-transient` | Only the first attempt is answered with a 502; the retry gets the real answer | Nothing: a read that recovers on retry is not reported |

The API probes fail exactly the attempts `retryTransientReadFailure` makes (`MAX_READ_RETRIES` + 1), so the probed read reaches the cache as a terminal failure; requests after it, and every other request, are untouched, and the app's retry behavior is the same as in a release. `probe-transport.test.ts` runs each probe through the app client, the per-scope query cache, and the reporter.

Sign in to a real (non-demo) account with "Share usage analytics and error reports" on. Until then, reports are held. The probed read only sets the time zone, so the app keeps working. The API probes send real read requests and change nothing. Synthetic provider failures behind the Worker (for a real Worker 5xx) are covered by `worker.stack.test.ts`, not by the app.

Distributing a verification build (signing, upload, install) is an external step for whoever owns the release. Keep it to internal testers.

## Verification

Unit tests cover the sentinel, the sanitizer (credentials included, through captured events), the policy, the pending-fatal copies (writes cut short at several points), the client (origins, purge aborting a delivery), API classification and late failures across account switches, sign-out, demo, and opt-out through the real app client, scoped caches, and query retries, the probes through the same path, the provenance check against two real composition runs, the request-ID grammar, and the Worker stack. The stack test joins a native 5xx to exactly one `rpc` line by request ID with `appRelease`.

These must be shown on a real release build installed from TestFlight. Upload or configuration success does not count:

1. One event of each kind (handled error, render failure, unhandled rejection, startup fatal on the next launch, API 5xx, network failure, undecodable answer) arrives in project 614621 with `$app_build` and `source_revision` matching the installed build, and `api-5xx-transient` produces none.
2. Frames symbolicate to `apps/mobile/src/…` TypeScript paths. Each frame's `chunk_id` equals the uploaded symbol set's ID.
3. An `api request failed` event's `request_id` finds exactly one Workers Logs `rpc` line with the same `appRelease`.
4. The Slack destination posts the `$exception` events.
5. A native crash appears in Xcode Organizer or TestFlight for the same build.
