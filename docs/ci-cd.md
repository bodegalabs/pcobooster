# CI/CD

The Cloudflare workflow separates secretless validation from deployment: labeled pull requests deploy previews, and merges to `main` deploy staging and then production. `ci` runs dependency review, strict linting, typechecks, and tests. `cloudflare-build` runs the product's and the admin app's Vite Worker builds (with the prerendered marketing site staged into the product) without credentials. Both run for pull requests and again on the merged commit on `main`, where they gate the staging and production deploys.

Run the local gates before opening a pull request:

```sh
bun run ci
bun run build
bun run build:cloudflare
```

Use Node 24 and the pinned Bun version. Actions are pinned to immutable commits and installs use the frozen Bun lockfile. CI has no Turborepo remote-cache credential.

Shared steps live in composite actions:

- `.github/actions/setup` pins Node and Bun, restores the Bun package cache, and installs. Change toolchain versions there only.
- `.github/actions/infisical` exchanges the job's OIDC token for one environment's secrets.

The `ci` job also runs checksum-verified `actionlint`. Run it locally when you edit workflows.

Concurrency is set per job. A new push to a pull request cancels that PR's older `ci` and `cloudflare-build` jobs. Deploy and cleanup jobs share a per-stage group that never cancels, so an Alchemy state update is never interrupted.

`scripts/check-patches.test.ts` runs in `bun run test`. It fails if any installed copy of a patched dependency is missing a line the patch adds, for example after a stale Bun cache.

## Preview lifecycle

Previews deploy only on request. Add the `preview` label to a same-repository pull request; adding the label, and every later push while it is present, requests a deployment once validation passes. The label is the approval: while it is present, every push to the PR deploys without further review, so only label a PR whose incoming commits you trust. Pull requests without the label get checks only, with no waiting deployment. Adding the label reruns nothing: the `labeled` run skips `ci` and `cloudflare-build` and its `preview-gate` job waits for those checks to pass on the current head. Opening a PR with the label already on it (`gh pr create --label preview`) sends `opened` and `labeled` together, and both runs would deploy the same head. So the gate (`scripts/cloudflare/preview-gate.ts`) leaves the deploy to another run whose `preview` job for this head appeared after the `labeled` run started. Earlier preview jobs don't count, so labeling again still recreates a preview the nightly sweep removed, and re-running a skipped `preview` job always deploys.

Deploys build from source: Alchemy runs each Vite app's build itself and skips an app whose inputs are unchanged, so `cloudflare-build` outputs are validation only. Feature flags are evaluated at runtime, so every stage builds the same product bundle. Fork PRs receive secretless checks only. A labeled revision gets preview app secrets and an account-scoped Cloudflare token, so review workflow/dependency changes before they land on a labeled PR.

A preview job authenticates to Infisical using GitHub OIDC, checks the PR is still open at the expected head, and runs `bun alchemy deploy --stage pr-<number>`. Alchemy owns a separate D1 database, Planning Center cache KV namespace, API/web/admin Workers, and Cloudflare Access application for each PR, so opening a preview asks for the same one-time-code sign-in as staging (see [Staging](#staging)). The preview URL is exposed in GitHub's deployment environment. Production data is never copied into these databases.

Every deploy then runs `scripts/cloudflare/verify-deployment.ts`. Both the web and API Workers carry the deployed `GITHUB_SHA` as a `PCOBOOSTER_VERSION` env prop, so every commit redeploys both even when only one app changed. The script polls the web Worker's `GET /version` and the API's `health` procedure (through the web Worker, with `makeProductClient` as the `deploy` client at `GET /api/v1/health`, so the whole API answers) until both report the commit, then checks that `/` returns 200. A deploy that finishes without the new code live in either Worker, or with a broken web → API binding, fails the job.

Pass a value a Worker must redeploy for as an `env` prop, not a `Config` read inside an Effect-native Worker's init (`apps/server/src/worker.ts`): Alchemy's change detection hashes `env` props and file inputs but not init-time `Config` reads, so changing only such a value (including rotating a secret) plans as a noop. Force a redeploy with `bun alchemy deploy --force` after rotating one.

Teardown uses `alchemy.cleanup.ts`. It has the application stack's name and state but declares no resources. That lets `alchemy destroy alchemy.cleanup.ts --stage pr-<number>` remove everything a stage recorded, without app secrets, a build, or configuration that `main` added after the PR opened. It refuses any stage that isn't `pr-<number>`.

Cleanup runs in the `cloudflare-preview-cleanup` environment. That environment is restricted to `main` and needs no approval, because it only ever runs trusted `main` code:

- Closing a same-repository PR triggers `pull_request_target`, which checks out `main` (never PR code), confirms the PR is still closed, and destroys its stage.
- A nightly sweep (`scripts/cloudflare/sweep-previews.ts`, also available through `workflow_dispatch`) lists `pcobooster-pr-*` Workers and D1 databases, then destroys every stage whose PR is no longer open. It also destroys an open PR's stage once it has gone 3 days without a deploy, measured by the newest Worker upload; the next push to a labeled PR recreates it. Previews therefore expire even when a PR stays open. Use `--dry-run` locally to see what it would destroy.

Deployment and cleanup share a per-stage concurrency group. Reopening the PR creates a fresh deployment request.

## Staging

`staging` is a persistent pre-production stage at <https://pcobooster-staging-web.jakebodea.workers.dev>. Every push to `main` (and a manual run with `deploy_production`) deploys it first, in the `cloudflare-staging` environment (`main` only, no reviewers); production waits for it, so a failing deploy or migration stops before production. Its D1 database is retained and its data persists across deploys. It runs the preview tier: preview secrets from the `pcobooster-preview` project, preview feature flag values, host-only cookies, admin at `/admin`, and Planning Center sign-in through production's OAuth proxy (its origin matches the preview pattern). Deploy it yourself with `bun run deploy:staging`.

Cloudflare Access protects it, and every pull request preview the same way. `alchemy.run.ts` gives each non-production stage's product Worker a dedicated Access application (the Worker's `access` prop) whose policies admit `PCOBOOSTER_ADMIN_EMAILS`, plus the deploy-check service token. It covers the `workers.dev` URL and version preview URLs; the API and admin Workers have no public URL outside production. Since the admin app has no check of its own ([admin](admin.md#access)), this is what keeps staging's and previews' `/admin` private. Access needs a Zero Trust organization on the account, with the One-time PIN login method (or another identity provider) enabled.

`alchemy.ci.ts` owns the service token (`pcobooster-staging-deploy-check`) and writes `STAGING_ACCESS_SERVICE_TOKEN_ID`, `CLOUDFLARE_ACCESS_CLIENT_ID`, and `CLOUDFLARE_ACCESS_CLIENT_SECRET` to the preview project. Staging and preview deploys read the id to admit the token; `verify-deployment.ts` sends the client credentials. The preview identity can already overwrite staging's Workers, so the token adds no reach. Both deploy tokens carry the account-level **Access: Apps and Policies Write** (`ACCESS_APPS_WRITE` in `alchemy.ci.ts`, referenced by id because a zone-level group shares its name and Alchemy resolves names to the first match): the preview token so staging and preview deploys (and preview cleanup) can manage their Access applications, and the production token for the admin Worker's. `alchemy.cleanup.ts` and the preview sweep never touch `staging`.

## Production

Merge equals deploy. A push to `main` deploys production after `ci`, `cloudflare-build`, and the `staging` deploy pass. So does a manual CI run on `main` with `deploy_production`. `cloudflare-production` accepts only the `main` branch and has no approval gate. When newer `main` has superseded the revision, the job ends green without reading production secrets or deploying; the newer revision's own run deploys it. Staging and labeled previews skip superseded (or closed) revisions the same way. Post-deploy verification then fails the run unless pcobooster.com serves the merged commit. The required checks on the pull request, then the same checks on the merged commit, are the only gates before production, so keep them strict.

After verification, the job marks the release on PostHog charts. It skips with a warning when `POSTHOG_ANNOTATION_API_KEY` is absent; see [analytics](analytics.md#deploy-annotations). PostHog dashboards are applied separately with `bun run posthog:deploy`, never by CI.

Infisical's production OIDC identity binds the environment subject and the `ref=refs/heads/main` claim. The production project contains production app secrets and its own Cloudflare token; it excludes development PATs and migration-only `DATABASE_URL`.

`CLOUDFLARE_CUSTOM_DOMAINS=1` in the production GitHub environment attaches pcobooster.com, www, and admin to the production Workers. The admin Worker always sits behind Cloudflare Access; see [admin](admin.md#access).

A nightly `Cloudflare drift` workflow (also available through `workflow_dispatch`) runs `scripts/cloudflare/check-drift.ts` for `staging` and `prod`, each in its own GitHub environment. It compares every resource Alchemy manages in that stage with its live Cloudflare state and fails, listing them in the job summary, when any were changed outside a deploy, such as a Flagship flag, DNS record, or Access policy edited in the dashboard. It only reads. The next deploy would overwrite those edits, so either copy the change into code or restore it with `bun alchemy drift --stage <stage> --repair`. Each check shares its stage's deploy concurrency group, so it never observes a half-applied deploy.

The repository check compares equivalent provider representations before deciding whether to fail. For Alchemy beta.79, a Worker read reconstructs serving hostnames without the deployment-only `domain.zone` selector; an absent D1 replication declaration means `disabled`. The check also excludes the Flagship app's `updatedAt` and the zone's `activatedOn`/`modifiedOn` timestamps. These rules are scoped to their resource types; domain attachments, replication mode changes, zone `status`, and other configuration still fail, as do missing resources and unclassified drift. This changes only the read-only check, not Alchemy state, resource configuration, or the upstream CLI's drift comparison. A zone status change still requires review even when its only other differences are timestamps.

To roll back, revert the change on `main`; the revert deploys like any other merge. Schema changes follow [database migrations](database.md#migrations-must-keep-the-running-app-online), so the previous code stays compatible with the migrated database.

A deploy you run yourself (`bun run deploy:production`, `bun run infra:deploy`) is still a manual production change: confirm it with Jake first.

## iOS releases (TestFlight)

Until the CI executor below is enabled, TestFlight builds ship from a person's Mac with `ios:testflight`, the one supported local upload path. `ios:release` on its own still only prepares archives or exports signed IPAs, and `release-ios.sh --upload` stays refused.

### Local TestFlight release

From the main checkout (or any worktree) at `origin/main` with no changes, signed into Xcode with an account on team `6C46GY4Z38`, with the `pcob-release-smoke` simulator and Maestro installed (see [Release smoke check](#release-smoke-check)):

```bash
infisical run --env=prod --path=/apple --projectId=2eca20e1-20ac-4f06-a086-99ea5c590483 -- bun run --cwd apps/mobile ios:testflight
```

Inject only Production `/apple` (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`), never the application's `/` secrets. `scripts/release/testflight.ts` runs, in order:

1. Refuses a CI/provider marker, a preset `BUILD_NUMBER`, a missing App Store Connect key, or an analytics key other than the committed one, before running anything.
2. Fetches `origin/main` and requires `HEAD` to equal it with no tracked or untracked changes. Runs `bun install --frozen-lockfile` (a fresh worktree has no dependencies), `bun run ci`, `bun run build`, and `ios:release-smoke --build`, then rechecks the checkout. None of these steps sees the Apple key.
3. Runs `release-ios.sh --no-upload` with `PCOB_RELEASE_SIGNING=xcode-account` unless set otherwise. With the key, the build number is one above every App Store Connect build, every in-flight upload, every local claim, and floor 292; it is claimed before archiving. The Hermes gate runs before and after archiving, and the archive must embed the PostHog key ([analytics key](#analytics-key)).
4. Runs the [signed export gate](#signed-export-gate) against the IPA, with the React Native prebuilt frameworks below exempted from the dSYM check.
5. Rechecks that App Store Connect has nothing at or above the number (apart from the `AWAITING_UPLOAD` record Xcode's export itself creates for this number; build 374's export created one three seconds after it started, and the upload completes it), prints the version, build, revision, and IPA hash, and asks you to type the build number back (`--yes` skips this). Then makes one `xcrun altool --upload-package` with `--apple-id` (the numeric App Store Connect app id, which `findAppId` looks up), `--bundle-id`, `--bundle-version`, `--bundle-short-version-string`, and `--p8-file-path` pointing at an owner-only temporary key removed afterwards, also on interrupt.
6. Polls `ios:release:status` once a minute, for at most 30 minutes, until the build is `VALID` with this number and version `0.1.0`. `INVALID` or `FAILED` fails the run; a timeout exits non-zero and says the outcome is pending.

A failed or interrupted upload is never retried: Apple may still have it. Check `ios:release:status <build>`. The number stays claimed locally and burned, and the next release takes a higher one. Source maps are not uploaded and the CI ledger is not written; the source-map workstream and the executor own those. Tester-group access and installed-device acceptance remain manual.

Build 373 (2026-10-07, `524e880c`) was the first local upload: an `xcode-account` export and a hand-run `altool` with the flags above. App Store Connect processed it `VALID`. It shipped without the analytics key, so PostHog has no events or `$exception` from it; that release is why the key is now committed and checked.

### What's in TestFlight

```bash
infisical run --env=prod --path=/apple --projectId=2eca20e1-20ac-4f06-a086-99ea5c590483 -- bun run --cwd apps/mobile ios:release:latest
# Or the newest N builds, default 10, at most 200:
infisical run ... -- bun run --cwd apps/mobile ios:release:builds --limit 5
```

Both print JSON: each build's number, version, processing state, upload date, expiry, TestFlight internal and external states, and beta groups, newest upload first. `pendingUploads` lists uploads numbered above every listed build that App Store Connect has not listed as builds yet. `ios:release:status <build>` reads one build.

### Analytics key

The app reports analytics and diagnostics to PostHog project 614621 only when its archive embeds `EXPO_PUBLIC_POSTHOG_KEY` ([mobile diagnostics](mobile-diagnostics.md)). That project key is a public ingestion token that pcobooster.com already serves in its web bundle, so it is committed as `POSTHOG_PROJECT_KEY` in `apps/mobile/scripts/release/release-rules.ts` and every release archive embeds it from source. No release step reads Infisical `/` for it. `release-ios.sh` refuses an `EXPO_PUBLIC_POSTHOG_KEY` or `POSTHOG_PROJECT_KEY` in the environment that differs from the committed key, and refuses any archive whose `main.jsbundle` does not contain it, including a `--skip-build` export. If the project key ever rotates, change the constant in a reviewed commit. The symbol-upload key (`POSTHOG_CLI_API_KEY`) is a different, secret credential and is still never baked in.

### Preparing or exporting without uploading

From clean committed source after `bun run ci` and `bun run build`:

```bash
BUILD_NUMBER=<explicit-number> bun run ios:release --prepare
# Explicit signed local export, with this Mac's Apple account in Xcode:
BUILD_NUMBER=<explicit-number> PCOB_RELEASE_SIGNING=xcode-account bun run ios:release --no-upload
```

`--prepare` is the default: clean Expo prebuild, Pods, unsigned Release arm64 archive, exact source/app provenance, and the matching Hermes gate. It does not sign. `--no-upload` additionally signs and exports an IPA using `destination=export`. `--skip-build` reuses only a stamped archive whose revision, source state, native app files, JavaScript bundle, identity, version, and build number still match. The app keeps version `0.1.0` and bundle ID `com.pcobooster.ios`; production API requests use `https://pcobooster.com`. Archives need 15 GiB free disk and land in ignored `apps/mobile/build/release/`. Dotenv is disabled. Upload flags fail before native generation; environment markers cannot turn `release-ios.sh` into an uploader.

An ASC read key allows allocation above every iOS build and in-flight upload, with a machine-local claim ledger and lock preventing reuse within local preparation. Without a key, preparation/export requires an explicit number above floor 292 and local claims; that number is **not validated against ASC and cannot be uploaded** (`ios:testflight` requires the key). `build-number verify` fails without a read key. Git ancestry is never used. Local claims are preparation bookkeeping, not a distributed reservation: separate machines can observe the same ASC snapshot, so run one release at a time.

For ASC reads or API-key export, inject only Production `/apple`, never the application's `/` secrets:

```bash
infisical run --env=prod --path=/apple --projectId=2eca20e1-20ac-4f06-a086-99ea5c590483 -- bun run ios:release --no-upload
```

`ASC_KEY_ID`, `ASC_ISSUER_ID`, and one of `ASC_KEY_P8_BASE64` or `ASC_KEY_PATH` supply the key. Credentials are removed from native generation/compilation; decoded temporary keys use private permissions and are deleted on exit. `PCOB_RELEASE_SIGNING=xcode-account` explicitly uses the local Xcode account, optionally with the key for reads. Any truthy CI/provider marker refuses this fallback. API-key cloud signing remains **unproven**: the current key reads ASC but export failed with a permission/certificate error. An Admin team key and cloud-managed distribution certificate access require an actual successful export before being called supported.

### CI release executor: blocked until enablement

`.github/workflows/ios-release.yml` is the intended long-term upload path, triggered only by `workflow_dispatch` on `main`. Until it is enabled, uploads go through the [local TestFlight release](#local-testflight-release). Its app-wide `ios-release-com.pcobooster.ios` concurrency group covers every job with `cancel-in-progress: false`; that group, not a lock, serializes releases. The secretless `prepare` job runs the release boundary tests and the matching host Hermes gate. The `release` job (requested with `request_upload`, environment `ios-release-upload`) is implemented, but its **first step fails BLOCKED** before checkout, credentials, ledger writes, signing, or upload. Separately, `RELEASE_ENABLEMENT` in `apps/mobile/scripts/release/ci-release.ts` is `"blocked"`, so `ci-cli.ts release` and `availability` refuse before reading any credential, whatever CI variables are set, and the job grants no `id-token` or write permission. Local `release-ios.sh --upload` stays refused, even with spoofed CI markers. The existing `testflight` environment has no reviewer gate and shares a broad production Infisical identity, so the executor does not use it.

After the block, the job checks out exactly `github.sha`, refuses any `GITHUB_RUN_ATTEMPT` other than 1, selects the approved Xcode, runs `bun run ci`, installs checksummed Maestro and `posthog-cli`, runs the Release simulator smoke at this revision, reads the isolated credentials through OIDC, then runs `bun run --cwd apps/mobile scripts/release/ci-cli.ts release` once and the bounded `availability` report. Artifacts (manifest, IPA, maps, dSYMs, uploader output, Hermes and smoke evidence) are retained for 90 days; they are review material, not the ledger.

`ci-cli.ts release` (`runRelease` in `ci-release.ts`, with every external step injected for tests) runs, in order:

1. Refuse a rerun attempt; check the checkout is the clean dispatched revision and the sealed smoke evidence matches it. Nothing is claimed yet.
2. Read the durable ledger and App Store Connect. The build number is one above every ASC build, every in-flight ASC upload, every ledger claim, and floor 292. A missing, corrupt, or foreign ledger, or a failed ASC read, fails here.
3. Persist `claimed` before any archive work. If the write fails, stop; the next run rereads the ledger, so a write that landed still burns its number.
4. `release-ios.sh --prepare` (clean prebuild, unsigned archive, Hermes gates, maps), then `--no-upload --skip-build` with API-key signing. Verify the signed export (below), upload source maps through `source-maps.ts upload` and check the cloned map, and persist `verified` with every artifact hash. Any failure persists `abandoned`; the number stays burned. Archive and export never see the PostHog key or ledger token, and the source-map upload never sees the Apple key or ledger token.
5. Recheck the IPA and manifest hashes and that ASC has nothing at or above this number, then persist `upload_started`. The export's own `AWAITING_UPLOAD` record for this number would fail this recheck as written; the executor must exclude it as the local release does (`takenBuildNumbers(..., ownExport)`) before enablement. If that write fails, the uploader is never called.
6. One `xcrun altool --upload-package` of the verified IPA, with the app's numeric `--apple-id` and the build's bundle ID, version, and build number, and the key in an owner-only temporary file removed afterwards. A failure, an interruption, or an error printed with exit 0 leaves `upload_started`: the outcome is unknown, so nothing retries it and the number is never reused.
7. Persist `upload_accepted`. If that write fails, the run reports the upload as unknown; reconciliation shows it.

`ci-cli.ts availability` polls ASC at most 30 minutes (once a minute) and records `processed` only for a `VALID`, unexpired build with this exact build number and version `0.1.0`. A timeout or an unlisted build is reported as unknown, never as proof that retrying is safe. Tester-group access, release metadata, and physical-device acceptance stay separate human checks.

`bun run --cwd apps/mobile scripts/release/ci-cli.ts reconcile` (ledger read token and ASC read key in the environment) is read-only. It lists each ledger record with ASC's view: an `upload_started` build ASC lacks is **unknown**, not failed; ASC builds above the first claim that the ledger never claimed were uploaded by something else. Nothing reconciles automatically, and nothing ever reuses a number.

#### Durable ledger

The ledger lives on the dedicated `ios-release-ledger` branch: `ledger.json` (version, bundle ID, repository) and `events.jsonl`, one event per line. Each build follows `claimed -> verified -> upload_started -> upload_accepted -> processed`, or `claimed | verified -> abandoned`, all from the run that claimed it; one claim per run, claims only increase, and an upload of unknown outcome can never become `abandoned`. Every transition reads the branch head, creates a child commit through the Git data API, moves the ref with `force: false`, and rereads the branch to confirm exactly that event landed. A moved head is refused (`LedgerConflictError`) and never retried. Blobs are checked against their Git object IDs. A missing branch is an error, never an empty ledger. Caches and expiring Actions artifacts are never authoritative. `release-state.ts` remains local preparation bookkeeping only.

#### Signed export gate

`signed-export.ts` unpacks the one exported IPA into a private temporary folder (always removed) and requires: bundle ID, version, and build in `Info.plist`; `main.jsbundle` byte-identical to the stamped archive; `codesign --verify --deep --strict`; an Apple Distribution authority chained to Apple Root CA for team `6C46GY4Z38` and identifier `com.pcobooster.ios`; distribution entitlements (`application-identifier`, team, no `get-task-allow`); an App Store provisioning profile (no device list); every executable's LC_UUID present in the archive's dSYMs and in the IPA's `Symbols/`, with no framework exempt until a real export is reviewed; source maps that `source-maps.ts` ties to this bytecode; Hermes evidence that passed for this revision and bundle hash; and the sealed smoke capture. It writes `release-manifest.json` and returns hashes of the IPA, maps, dSYMs, evidence, and manifest for the ledger. A successful symbol upload, or `uploadSymbols`, is not proof that a real crash symbolicates.

#### Enablement approvals (none granted)

Each item needs explicit approval and proof before the block is removed. None follows from code review or from an uploader exit code.

- `ios-release-upload` environment: `main` only, a required reviewer other than the dispatcher, no self-approval or admin bypass. Confirm the repository supports those rules.
- The `ios-release-ledger` branch, initialized with the header above and an empty `events.jsonl`, protected against deletion and force pushes, writable only by the executor's identity. If `GITHUB_TOKEN` with `contents: write` cannot be limited to that branch, approve a scoped GitHub App token instead of broadening the job.
- A new Infisical project and environment, imports disabled, holding only the ASC read and signing key and a separately approved PostHog symbol-upload key; a machine identity whose OIDC subject is bound to this repository, `main`, this workflow, and `ios-release-upload`. Set `INFISICAL_PROJECT_ID`, `INFISICAL_IDENTITY_ID`, and `INFISICAL_ENV_SLUG` on that environment only. The production project and the `testflight` identity are excluded.
- Apple: a key role and distribution certificate/profile access that make `xcodebuild -exportArchive` with `-allowProvisioningUpdates` and the API key succeed for this app and team. The current read-capable key failed with a cloud-signing permission/certificate error; an actual successful export must replace that.
- The runner's Xcode (`IOS_RELEASE_DEVELOPER_DIR`), its simulator runtime for `iPhone 17 Pro`, and its `altool --upload-package` options, proven on the runner image. A local upload (build 373) proved `--apple-id`, `--bundle-id`, `--bundle-version`, `--bundle-short-version-string`, and `--p8-file-path` with this key on a developer Mac only.
- Checksummed tool releases: `IOS_RELEASE_MAESTRO_URL`/`_SHA256` and `IOS_RELEASE_POSTHOG_CLI_URL`/`_SHA256` (`posthog-cli` 0.18.9).
- A reviewed list of any embedded framework that ships without a dSYM, from a real export. Build 373's export had dSYMs and `Symbols/` entries for the app and every Expo framework, and none for React Native's prebuilt `React.framework`, `ReactNativeDependencies.framework`, and `hermesvm.framework`. The local release exempts exactly those (`PREBUILT_FRAMEWORKS_WITHOUT_DSYMS`); the executor still passes an empty list until this item is approved.
- PostHog: authorization for source-map upload, and a synthetic internal event that symbolicates against the exact release maps.
- The enablement change itself: remove the block step, set `RELEASE_ENABLEMENT` to `"approved"`, and grant `id-token: write` plus the approved ledger writer, in one reviewed commit. Then a separately confirmed dispatch of that exact revision. Apple processing, build/version, tester-group access, metadata, and device acceptance are verified separately afterwards.

dSYMs stay in the archive and the IPA carries `Symbols/`; the source-map workstream (#298) owns JavaScript symbolication beyond these gates.

### Release Hermes gate

`bun run --cwd apps/mobile ios:hermes-gate` checks that the production contracts and the typed product client load in the exact Hermes engine the app ships, from Release bytecode. It resolves the Hermes V1 version React Native's podspec installs, takes that version's release tarball from Maven Central (CocoaPods' shared cache first, checked against Maven's SHA-1), compiles a small runner against the tarball's macOS `hermesvm` framework, bundles a probe with `expo export:embed` (the Release build's own bundling command, configuration, and polyfills), and compiles it with the tarball's `hermesc` and React Native's Release flags (`-emit-binary -O`). The current source must pass and reflect exactly the route table Node computes; the build 371 route parser, put back into a copy of `endpoint.ts`, must fail with build 371's fatal (`/service-types/:serviceTypeId/plans names params [] but declares [serviceTypeId]`), so the gate cannot pass by testing nothing. Node and Bun parse the old routes correctly, which is why only a Hermes check catches it. It takes about 15 seconds and needs macOS and Xcode's clang, not a native app build.

`ios:release` runs the gate before archiving and again after, parsing the entire archived `main.jsbundle` with the matching `hermesc -b -dump-bytecode` reader and recording its SHA-256. A header/version match alone cannot pass. The archive app tree is separately stamped and verified against source before/after the build; the host probe still does not execute the React Native archive bundle or establish native/device startup. Evidence (`evidence.json`, probe output, bytecode hashes) lands in ignored `apps/mobile/build/hermes-gate/runs/<revision>`, labeled `host-hermes-probe`: it covers module load and client construction, not React Native, UIKit, native modules, routing, or a device. The gate is not part of `bun run ci`; run it when a change touches `packages/contracts`, `packages/client`, `packages/planning-center-models`, or app startup, and always before a release.

### Release smoke check

`bun run --cwd apps/mobile ios:release-smoke --build` builds a Release simulator app (Hermes bytecode, no Metro) with `EXPO_PUBLIC_PCOB_RELEASE_SMOKE=1`, erases the dedicated `pcob-release-smoke` simulator (create it once with `xcrun simctl create pcob-release-smoke "iPhone 17 Pro"`), and cold-launches five paths with Maestro: fresh install signed out, signed out offline, fixture sign-in saved to the Keychain, restored session, and restored session offline. A path passes when its first screen appears, the process is still running, `device.log` has no fatal JS or native error, and no crash report appeared. The smoke flag routes every request to the fixtures, or fails it as a lost connection, while the Keychain, app storage, query-cache restoration, native modules, and router stay real; no Planning Center or production API request is made. `release-ios.sh` refuses to archive with the flag set, and builds without it never read `-PCOBSmoke`. Before/after source fingerprints and full native app/bundle hashes bind the build stamp. Without `--build`, reuse requires the same source state and every app file to match; a dirty stamp cannot be promoted to clean evidence after reverting edits. A sealed evidence tree and manifest validator check all five paths, app/source identity, logs, and screenshots. Revalidate retained evidence with `bun run --cwd apps/mobile scripts/release/artifact-cli.ts verify-evidence <capture-directory> <app-directory>`; the sibling `<capture-directory>.sha256` is an integrity checksum, not a signature against a malicious operator. Evidence lands in `apps/mobile/.captures/release-smoke/<revision>/manifest.json` with each path's log, screenshots, and Maestro output, labeled `simulator-release-smoke`.

Run the smoke check before declaring a beta usable. The Release build takes several minutes and several GB of derived data, so it is not part of PR CI. The smoke check does not cover the signed TestFlight binary, a physical device, native OAuth, or live data; installed-device acceptance is #304.

### After upload

An upload does not establish TestFlight availability. `ios:testflight` waits for `VALID`; `bun run --cwd apps/mobile ios:release:status <build>` (with the key in the environment) reads the build's processing state, version, TestFlight internal and external states, and beta groups at any time. Check that the processed build matches the uploaded number and revision, then confirm tester access in App Store Connect. There is no enabled upload job. The dispatched executor remains blocked until the enablement approvals above are granted and proven. `alchemy.ci.ts` retains the `testflight` environment, its production OIDC binding, and the `TESTFLIGHT_RELEASES` variable for a future job.

## OIDC and token scope

GitHub environment variables are `INFISICAL_PROJECT_ID`, `INFISICAL_IDENTITY_ID`, `INFISICAL_ENV_SLUG`, and `CLOUDFLARE_ACCOUNT_ID`. Infisical supplies `CLOUDFLARE_API_TOKEN`; no long-lived Infisical or Cloudflare credential is stored in GitHub.

The issuer/discovery URL is `https://token.actions.githubusercontent.com`; audience is `https://github.com/bodegalabs/pcobooster`. This repository uses immutable OIDC subjects:

- Preview, cleanup, and staging: `repo:bodegalabs@305914027/pcobooster@1125110564:environment:{cloudflare-preview,cloudflare-preview-cleanup,cloudflare-staging}`. This is an Infisical glob that matches exactly those three environments.
- Production and TestFlight: `repo:bodegalabs@305914027/pcobooster@1125110564:environment:{cloudflare-production,testflight}`

Access tokens have a one-hour TTL and maximum TTL. The preview identity is Viewer only in `pcobooster-preview`. Its Cloudflare token permits Workers Scripts Write, Workers KV Storage Write, D1 Write, Secrets Store Write, and Flagship Write in the current account. Each stage's API declares a KV namespace for the shared Planning Center read cache (`apps/server/src/planning-center-cache.ts`), which needs Workers KV Storage Write. It has no DNS, registrar, R2, or token-administration permission. These account-level permissions can affect other resources in that account; project separation does not create resource-level Cloudflare isolation. Only revisions on a PR you labeled may deploy previews.

Each deployed stage's API declares a Cloudflare Flagship app and flags ([Feature flags](environment.md#feature-flags)), so both deploy tokens also carry the account-level **Flagship Write** permission group (it includes read). Alchemy 2.0.0-beta.79's typed permission catalog does not list Flagship yet, so `alchemy.ci.ts` references it by ID (`521a41dc78f94eaba5e643528846cb7b`). App-scoped Flagship tokens do not fit, because previews create their apps. Changing `deployPermissions` updates both tokens in place (their values do not change), so apply it with `CLOUDFLARE_TOKEN_ADMIN_API_TOKEN` as described in [Control plane as code](#control-plane-as-code).

The production token has the same account-level deployment permissions, plus Zone Read, DNS Write, Dynamic URL Redirects Write, Zone WAF Write, and Bot Management Write scoped to two zones: `pcobooster.com` and the former `worshipadmin.com`, which the `prod` stage answers with a redirect rule (see the [former domain cutover](cloudflare-cutover.md#former-domain-cutover)). It has no Zone Write, so it can neither create nor delete zones: a new zone is created by hand and then adopted. `alchemy.ci.ts` resolves their IDs by name at plan time, so a zone must exist before `infra:plan` or `infra:deploy` can run. The token is stored only in the production Infisical project. `Cloudflare.state()` shares the bootstrapped Alchemy state Worker and Secrets Store across stages. Keep their credentials out of application bindings, artifacts, and logs.

## Control plane as code

`alchemy.ci.ts` (stack `pcobooster-ci`, stage `ci`, state in the shared `Cloudflare.state()` store) owns the CI/deploy control plane. Change these settings there, not in the GitHub, Cloudflare, or Infisical dashboards:

- Repository merge settings on `bodegalabs/pcobooster`: squash on, merge commits off, auto-merge on, delete branches on merge. `allowRebaseMerge` is deliberately unmanaged; the ruleset alone keeps `main` squash-only.
- The `main` ruleset "Protect main via pull requests" (`scripts/infra/main-ruleset.ts`): required checks `ci` and `cloudflare-build` from GitHub Actions, squash-only merges, linear history, no deletion or force pushes, and no bypass actors. `main-ruleset.test.ts` compares it with a snapshot of the live ruleset.
- The `cloudflare-preview` (any branch, no reviewers), `cloudflare-preview-cleanup` (`main` only), `cloudflare-staging` (`main` only, no reviewers), `cloudflare-production` (`main` only, no reviewers), and `testflight` (`main` only, no reviewers) environments and their variables. The repository is public, so GitHub accepts environment protection rules on the Free plan.
- The preview and production Cloudflare deploy tokens, as account-owned API tokens.
- `CLOUDFLARE_API_TOKEN` in each Infisical deployment project (preview `staging`, production `prod`, path `/`), written from the token Alchemy just created.
- Staging's Access service token and its three secrets in the preview project (see [Staging](#staging)).
- Both Infisical identities' GitHub OIDC bindings.

Alchemy has no Infisical provider and its GitHub ruleset cannot express allowed merge methods, so `scripts/infra/` adds small providers for the Infisical secret, the OIDC binding, and the ruleset. It also gives Alchemy's GitHub Repository, Environment, and Variable providers a lookup by name. Everything that already existed is adopted: the plan shows it as `adopted`, and the first deploy writes only differences. The ruleset is found by name and adopted explicitly (`adopt(true)`); it is updated in place, never recreated. All adopted GitHub and Infisical objects are retained if their declaration is removed.

### Credentials

| Credential | Used for | Source |
| --- | --- | --- |
| GitHub | Repository, ruleset, environments, variables | `GITHUB_TOKEN=$(gh auth token)`; needs repository admin |
| Infisical | Secrets and OIDC bindings | `INFISICAL_API_TOKEN=$(infisical user get token --plain)`; needs admin on both deployment projects |
| Cloudflare | The shared state store | Your default Alchemy OAuth profile (`bun alchemy profile edit` to connect, `bun alchemy profile refresh` to renew). The scripts unset `CLOUDFLARE_API_TOKEN` so a stray deploy token is never used. |
| Cloudflare token admin | Creating, updating, reading, or revoking deploy tokens | `CLOUDFLARE_TOKEN_ADMIN_API_TOKEN`, only when a token changes |

Neither the Alchemy OAuth scopes nor the deploy tokens can mint API tokens; that needs `Account API Tokens Write`. Only `AccountApiToken` calls use the token-admin credential (`scripts/infra/cloudflare.ts`), so the rest of the stack never runs with it. Create it when you need it: Cloudflare dashboard → Manage Account → Account API Tokens → Create Token → Custom token, permission Account · Account API Tokens · Edit on this account, expiring the same day. Delete it after the deploy. Do not store it in Infisical: both CI identities can read their whole project.

`bun run infra:plan` is a dry run with drift detection and needs no token-admin credential; without one it trusts the recorded token state. `bun run infra:deploy` applies. Review the plan first and confirm with Jake before applying.

### Rotating the deploy tokens

The tokens expire on `deployTokens.expiresOn` in `alchemy.ci.ts`. To rotate, bump `deployTokens.generation` (and move `expiresOn` a year out), then:

1. `bun run infra:plan`, and check that it creates only the two new tokens, updates the two Infisical secrets, and deletes the previous generation.
2. `CLOUDFLARE_TOKEN_ADMIN_API_TOKEN=<short-lived admin token> bun run infra:deploy`. Alchemy creates the new tokens, writes them to Infisical, and then revokes the previous generation.
3. Deploy a preview (re-run a pull request's `preview` job) and production (run CI on `main` with `deploy_production`). Both must pass `verify-deployment.ts`.

A job already running when step 2 revokes the old token fails; re-run it.

The first `infra:deploy` replaces the hand-made tokens rather than rotating Alchemy's. It creates generation 1 and overwrites `CLOUDFLARE_API_TOKEN` in both projects, but the hand-made tokens stay valid because Alchemy never managed them. After a preview and a production deploy succeed on the new tokens, delete the hand-made ones in the Cloudflare dashboard (Manage Account → Account API Tokens): preview `fb50d1add65f36b1376ba24b8de59b56` and production `8241ade77e46e28393c7d7ffa4dd1793`.

## Cloudflare drift

### Refreshing the production zone activation record

The `Cloudflare drift` workflow reads provider state and reports configuration or zone-status changes. `scripts/cloudflare/drift-comparison.ts` excludes only verified provider representation differences and timestamps; it retains zone status.

On October 8, 2026, run [37810110050](https://github.com/bodegalabs/pcobooster/actions/runs/37810110050) confirmed all 11 staging resources matched. Production differed only in the logical `Zone` status: Alchemy still recorded `pcobooster.com` as `pending`, while the same zone had been active since September 23. `FormerZone` is the separate `worshipadmin.com` record and is outside this maintenance operation.

`refresh-production-zone-activation.ts` is custom maintenance through Alchemy's public `StateService` and Zone provider APIs. Alchemy beta.79 has no targeted accept-live operation: the [drift CLI](https://alchemy.run/cli/drift) repairs every observed resource, and the [state CLI](https://alchemy.run/cli/state) lists, reads, or deletes records. This script reads only `pcobooster/prod/Zone` and its exact provider zone; it updates only the recorded status and activation/modification timestamps. It preserves desired props, resource lifecycle metadata, bindings, and all other attributes. It never invokes provider reconciliation or changes Cloudflare zone settings, DNS, Workers, or `FormerZone`.

Use the saved default Alchemy Cloudflare profile, with stray deployment credentials removed. The dry run does not need application secrets or evaluate the application stack:

```sh
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID bun scripts/cloudflare/refresh-production-zone-activation.ts
```

After reviewing the reported three fields, confirm no local or GitHub production deployment is running or queued in the `cloudflare-prod` concurrency group. Then apply the single record refresh:

```sh
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID bun scripts/cloudflare/refresh-production-zone-activation.ts --apply
```

The script requires the hardcoded account, zone ID, and hostname to match both stored and observed attributes, and permits only `pending` to `active`. It refuses configuration changes, missing resources, unstable resource lifecycle states, and a changed record immediately before the write. Alchemy's StateService has no atomic compare-and-set, so keeping deployments idle remains necessary. The script verifies the record after writing; a later invocation returns `already-active` without writing. Finally dispatch the read-only `Cloudflare drift` workflow on `main` and verify both stage reports. Keep status comparisons enabled so future inactive or moved zones remain visible.

The one-time refresh was applied on October 8 after independent review and idle deployment checks, using the saved `admin` Alchemy profile. A subsequent invocation returned `already-active` with no differing fields. Read-only [run 37811619586](https://github.com/bodegalabs/pcobooster/actions/runs/37811619586) then passed on revision `352dd1d442a8444c975d650770371c64a0bfaad4`: all 25 production resources and all 11 staging resources matched. The ordinary drift matcher remained unchanged.

## Merge gates

The `main` ruleset requires `ci` and `cloudflare-build` and is managed by `alchemy.ci.ts`. Preserve squash-only merging and the absence of bypass actors. There is deliberately no merge queue: merges rarely overlap, and `ci` and `cloudflare-build` rerun on the merged commit before staging, so a conflict between two pull requests fails there instead of deploying. Never remove a gate merely to bypass a red or missing check.

Cloudflare/D1 became the live production system on September 23, 2026; see the [cutover record](cloudflare-cutover.md). Vercel temporarily forwards cached DNS traffic to Cloudflare, and Neon is retained as the source snapshot. Follow [database migration and rollback](database.md): after D1 accepts new writes, routing back to the old PostgreSQL snapshot alone is not a safe rollback.
