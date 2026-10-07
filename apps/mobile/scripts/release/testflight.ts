/**
 * The supported local TestFlight release, run from this Mac until the CI executor is enabled:
 * preflight, signed export, the signed-export gate, one upload, then App Store Connect processing.
 *
 * Usage, from a clean checkout of origin/main with Production `/apple` injected:
 *   infisical run --env=prod --path=/apple --projectId=<id> -- bun run --cwd apps/mobile ios:testflight [--yes]
 *
 * 1. Refuses automation, a preset BUILD_NUMBER, or a missing App Store Connect key.
 * 2. Requires HEAD to be origin/main with no changes, then `bun install --frozen-lockfile`,
 *    `bun run ci`, `bun run build`, and the Release simulator smoke. None of them sees the key.
 * 3. `release-ios.sh --no-upload`: a build number above every App Store Connect build and
 *    in-flight upload and every local claim, the Hermes gates, the embedded analytics key, and
 *    a signed export (the Apple account in Xcode unless PCOB_RELEASE_SIGNING says otherwise).
 * 4. `verifySignedExport`: the IPA is the archived, Hermes-gated bytecode, distribution-signed for
 *    the team, with symbols, maps, and smoke evidence for this revision.
 * 5. Rechecks that App Store Connect still has nothing at or above the number, asks for the build
 *    number to be typed back (unless --yes), and makes one `altool` upload. A failed upload is
 *    never retried: its number stays claimed, and a new release takes the next one.
 * 6. Polls App Store Connect until the build is VALID, fails processing, or 30 minutes pass.
 *
 * Source maps are not uploaded, and the CI executor's ledger is not written.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { sourceState } from "./artifact-provenance";
import {
  ascKeyFromEnv,
  buildState,
  findAppId,
  makeAscClient,
  takenBuildNumbers,
} from "./asc";
import type { BuildState } from "./asc";
import { makeAltoolUploader } from "./ci-adapters";
import type { ArtifactIdentity, UploadReceipt } from "./ci-ledger";
import {
  PREBUILT_FRAMEWORKS_WITHOUT_DSYMS,
  automationMarker,
  parseBuildNumber,
  processingOutcome,
  releaseAnalyticsKey,
  stillUnused,
} from "./release-rules";
import {
  assertUnchanged,
  releasePaths,
  runCommand,
  verifySignedExport,
} from "./signed-export";

const BUNDLE_ID = "com.pcobooster.ios";
const VERSION = "0.1.0";
const TEAM_ID = "6C46GY4Z38";
const MINUTE_MS = 60_000;
const PROCESSING_TIMEOUT_MS = 30 * MINUTE_MS;

type Env = Readonly<Record<string, string | undefined>>;

const APPLE_KEYS: ReadonlySet<string> = new Set([
  "ASC_KEY_ID",
  "ASC_ISSUER_ID",
  "ASC_KEY_PATH",
  "ASC_KEY_P8_BASE64",
]);

/** The environment without the App Store Connect key, for every step that does not read it. */
export const withoutAppleKey = (env: Env): Env =>
  Object.fromEntries(
    Object.entries(env).filter(([name]) => !APPLE_KEYS.has(name))
  );

export interface Checkout {
  readonly head: string;
  readonly originMain: string;
  readonly dirty: boolean;
}

export interface LocalReleaseDependencies {
  /** Fetches origin/main and reports where this checkout stands. */
  readonly checkout: () => Checkout;
  /** Runs one step with its output visible; throws when it fails. */
  readonly run: (command: string, args: readonly string[], env: Env) => void;
  /** The build number and revision `release-ios.sh` stamped beside its archive. */
  readonly exported: () => {
    readonly build: number;
    readonly revision: string;
  };
  readonly verifyExport: (build: number, revision: string) => ArtifactIdentity;
  /**
   * Build numbers App Store Connect has, apart from the `AWAITING_UPLOAD` record this release's
   * own export created for `build`.
   */
  readonly appStoreConnectBuilds: (build: number) => Promise<readonly number[]>;
  /** Whether the person confirms the upload of this build. */
  readonly confirm: (identity: ArtifactIdentity) => Promise<boolean>;
  readonly assertUnchanged: (identity: ArtifactIdentity) => void;
  readonly upload: (identity: ArtifactIdentity) => Promise<UploadReceipt>;
  readonly buildState: (build: number) => Promise<BuildState | null>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  readonly log: (line: string) => void;
}

export interface LocalReleaseOptions {
  readonly env: Env;
  readonly timeoutMs: number;
  readonly intervalMs: number;
}

export type LocalReleaseStatus = "processed" | "failed" | "unknown";

export interface LocalReleaseResult {
  readonly build: number;
  readonly revision: string;
  readonly status: LocalReleaseStatus;
  readonly receipt: UploadReceipt;
  readonly state: BuildState | null;
}

/** Refusals that need no checkout, command, or network. */
const assertLocalRun = (env: Env): void => {
  const marker = automationMarker(env);
  if (marker !== null) {
    throw new Error(
      `${marker} marks this run as automation. Local TestFlight releases run on a person's Mac; automation uses the CI executor.`
    );
  }
  if ((env.BUILD_NUMBER ?? "") !== "") {
    throw new Error(
      "Unset BUILD_NUMBER: the release takes the next number above every App Store Connect build."
    );
  }
  if (ascKeyFromEnv(env) === null) {
    throw new Error(
      "Inject Production /apple (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64): build numbers, upload, and processing all read App Store Connect."
    );
  }
  releaseAnalyticsKey(env);
};

const assertOnOriginMain = (checkout: Checkout, when: string): void => {
  if (checkout.dirty) {
    throw new Error(
      `The checkout has changes ${when}. Release only committed source.`
    );
  }
  if (checkout.head !== checkout.originMain) {
    throw new Error(
      `HEAD ${checkout.head} is not origin/main ${checkout.originMain}. Release only what main deployed.`
    );
  }
};

const awaitValid = async (
  deps: LocalReleaseDependencies,
  build: number,
  options: LocalReleaseOptions
): Promise<{ status: LocalReleaseStatus; state: BuildState | null }> => {
  const deadline = deps.now().getTime() + options.timeoutMs;
  for (;;) {
    // Each read decides whether to wait for the next.
    // oxlint-disable-next-line no-await-in-loop
    const state = await deps.buildState(build);
    const outcome = processingOutcome(state, build, VERSION);
    deps.log(
      `Build ${build}: ${state?.processingState ?? "not listed by App Store Connect yet"}`
    );
    if (outcome !== "pending") {
      return { status: outcome, state };
    }
    if (deps.now().getTime() + options.intervalMs > deadline) {
      return { status: "unknown", state };
    }
    // oxlint-disable-next-line no-await-in-loop
    await deps.sleep(options.intervalMs);
  }
};

export const runLocalRelease = async (
  deps: LocalReleaseDependencies,
  options: LocalReleaseOptions
): Promise<LocalReleaseResult> => {
  assertLocalRun(options.env);
  const before = deps.checkout();
  assertOnOriginMain(before, "before the release");
  const plain = withoutAppleKey(options.env);
  deps.log(
    "==> Preflight: install, CI, build, and the Release simulator smoke"
  );
  deps.run("bun", ["install", "--frozen-lockfile"], plain);
  deps.run("bun", ["run", "ci"], plain);
  deps.run("bun", ["run", "build"], plain);
  deps.run(
    "bun",
    ["run", "--cwd", "apps/mobile", "ios:release-smoke", "--build"],
    plain
  );
  const preflighted = deps.checkout();
  assertOnOriginMain(preflighted, "after preflight");
  if (preflighted.head !== before.head) {
    throw new Error("HEAD moved during preflight; start the release again.");
  }

  deps.log("==> Signed export");
  deps.run("bash", ["apps/mobile/scripts/release-ios.sh", "--no-upload"], {
    ...options.env,
    PCOB_RELEASE_SIGNING:
      (options.env.PCOB_RELEASE_SIGNING ?? "") === ""
        ? "xcode-account"
        : options.env.PCOB_RELEASE_SIGNING,
  });
  const { build, revision } = deps.exported();
  if (revision !== before.head) {
    throw new Error(
      `The export is for ${revision}, not ${before.head}. Nothing was uploaded.`
    );
  }
  const identity = deps.verifyExport(build, revision);

  stillUnused(build, await deps.appStoreConnectBuilds(build));
  if (!(await deps.confirm(identity))) {
    throw new Error(`Build ${build} was not confirmed. Nothing was uploaded.`);
  }
  deps.assertUnchanged(identity);
  deps.log(`==> Uploading pcobooster.com ${VERSION} (${build})`);
  let receipt: UploadReceipt;
  try {
    receipt = await deps.upload(identity);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The upload of build ${build} failed or was interrupted (${why}). Apple may still have it: check \`ios:release:status ${build}\`. Never retry this number; a new release takes the next one.`,
      { cause: error }
    );
  }
  deps.log(
    `==> Uploaded; waiting for App Store Connect to process build ${build}`
  );
  const processed = await awaitValid(deps, build, options);
  return { build, revision, receipt, ...processed };
};

const mobile = path.resolve(import.meta.dirname, "../..");
const repo = path.resolve(mobile, "../..");
const out = path.join(mobile, "build/release");

const git = (args: readonly string[]): string => {
  const result = runCommand("git", ["-C", repo, ...args]);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
};

const confirmOnTerminal = async (
  identity: ArtifactIdentity
): Promise<boolean> => {
  if (process.argv.includes("--yes")) {
    return true;
  }
  if (!process.stdin.isTTY) {
    throw new Error("Confirm the upload on a terminal, or pass --yes.");
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = await prompt.question(
      `Upload pcobooster.com ${identity.version} (${identity.build}) from ${identity.sourceSha}, IPA sha256 ${identity.ipaSha256}?\nType the build number to upload: `
    );
    return answer.trim() === String(identity.build);
  } finally {
    prompt.close();
  }
};

const main = async (): Promise<void> => {
  // Refuse before reading anything from App Store Connect.
  assertLocalRun(process.env);
  const key = ascKeyFromEnv(process.env);
  if (key === null) {
    throw new Error("An App Store Connect key is required.");
  }
  const client = makeAscClient(key);
  const appId = await findAppId(client, BUNDLE_ID);
  const result = await runLocalRelease(
    {
      checkout: () => {
        git(["fetch", "--quiet", "origin", "main"]);
        const source = sourceState(repo);
        return {
          head: source.revision,
          originMain: git(["rev-parse", "origin/main"]),
          dirty: source.dirty,
        };
      },
      run: (command, args, env) => {
        // Exactly the given variables: what `env` leaves out, the step does not see.
        const childEnv: NodeJS.ProcessEnv = { ...process.env };
        for (const name of Object.keys(childEnv)) {
          Reflect.deleteProperty(childEnv, name);
        }
        Object.assign(childEnv, env);
        const step = spawnSync(command, args, {
          cwd: repo,
          stdio: "inherit",
          env: childEnv,
        });
        if (step.status !== 0) {
          throw new Error(
            `${command} ${args.join(" ")} exited ${step.status}.`
          );
        }
      },
      exported: () => ({
        build: parseBuildNumber(
          readFileSync(path.join(out, "build-number"), "utf-8").trim()
        ),
        revision: readFileSync(path.join(out, "revision"), "utf-8").trim(),
      }),
      verifyExport: (build, revision) =>
        verifySignedExport({
          repo,
          out,
          expected: {
            bundleId: BUNDLE_ID,
            version: VERSION,
            build,
            teamId: TEAM_ID,
            sourceSha: revision,
          },
          hermesEvidence: path.join(
            mobile,
            "build/hermes-gate/runs",
            revision,
            "evidence.json"
          ),
          smoke: {
            dir: path.join(mobile, ".captures/release-smoke", revision),
            app: path.join(
              mobile,
              "build/derived/Build/Products/Release-iphonesimulator/PCOBooster.app"
            ),
          },
          frameworksWithoutDsyms: PREBUILT_FRAMEWORKS_WITHOUT_DSYMS,
          run: runCommand,
        }),
      appStoreConnectBuilds: async (build) =>
        await takenBuildNumbers(client, appId, build),
      confirm: confirmOnTerminal,
      assertUnchanged: (identity) => {
        assertUnchanged(out, identity);
      },
      upload: makeAltoolUploader({ run: runCommand, key, appId, out }),
      buildState: async (build) => await buildState(client, appId, build),
      sleep: async (ms) => {
        await sleep(ms);
      },
      now: () => new Date(),
      log: (line) => {
        console.error(line);
      },
    },
    {
      env: process.env,
      timeoutMs: PROCESSING_TIMEOUT_MS,
      intervalMs: MINUTE_MS,
    }
  );
  console.log(
    JSON.stringify({ ...result, export: releasePaths(out).export }, null, 2)
  );
  if (result.status !== "processed") {
    console.error(
      result.status === "failed"
        ? `App Store Connect failed to process build ${result.build}.`
        : `Build ${result.build} is not VALID yet. Check later with \`ios:release:status ${result.build}\`; do not upload it again.`
    );
    process.exitCode = 1;
  }
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
