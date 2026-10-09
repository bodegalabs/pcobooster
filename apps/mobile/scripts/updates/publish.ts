/**
 * Publishes an over-the-air JavaScript update to the iOS builds whose native layer it fits, or
 * rolls them back to the JavaScript they shipped with. Run from this Mac; see
 * docs/ci-cd.md#ios-updates-over-the-air.
 *
 *   bun run ios:update [--stage prod|local] [--rollback [--runtime-version <fingerprint>]] [--yes]
 *
 * Production (`--stage prod`, the default):
 * 1. Refuses automation, an analytics key other than the committed one, and a signing key the
 *    builds' certificate does not accept, before running anything.
 * 2. Requires HEAD to be origin/main with no changes, and production's API to serve that commit:
 *    an update never runs ahead of the API it calls. Then `bun install --frozen-lockfile`,
 *    `bun run ci`, and the Release simulator smoke, none of which sees the signing key.
 * 3. Resolves the runtime version (Expo's fingerprint of the native layer), exports the iOS
 *    bundle with the committed analytics key and this revision, and checks it: Hermes bytecode
 *    the shipped engine reads (the Release Hermes gate) that embeds the analytics key.
 * 4. Builds the manifest, signs it and its "no update available" answer, checks both against the
 *    committed certificate, and asks for the update id's first 8 characters (unless --yes).
 * 5. Deploys `alchemy.mobile-updates.ts` with the operator's Alchemy login: files first, the answer
 *    last. Then asks the live route as a phone would and verifies every signature and asset hash.
 *
 * `--rollback` signs a "roll back to embedded" answer instead of exporting anything; phones of the
 * runtime version return to their build's own JavaScript on their next launch. It needs no
 * preflight, only the runtime version: `--runtime-version`, or a clean checkout's. `--stage local`
 * rehearses against `bun run dev` from any checkout, without the preflight.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";

import {
  DEFAULT_DEV_PORT_BASE,
  devOrigin,
  devPorts,
  parseDevPortBase,
  worktreeDevPortBase,
} from "@pcobooster/config/dev-ports";
import {
  encodePublishedUpdate,
  isRuntimeVersion,
} from "@pcobooster/contracts/mobile-updates";
import type { PublishedUpdate } from "@pcobooster/contracts/mobile-updates";
import { Schema } from "effect";

import { sourceState } from "../release/artifact-provenance";
import {
  automationMarker,
  releaseAnalyticsKey,
} from "../release/release-rules";
import { checkLiveUpdate } from "./live-check";
import type { ExpectedAnswer } from "./live-check";
import { encodePreparedRelease, RELEASE_VARIABLE } from "./prepared-release";
import type { PreparedRelease, UpdateStage } from "./prepared-release";
import {
  buildManifest,
  decodeExportMetadata,
  decodePublicAppConfig,
  publishedRollBack,
  publishedUpdate,
} from "./update-manifest";
import type { ExportedFile, Sign, Upload } from "./update-manifest";
import {
  CERTIFICATE_PATH,
  SIGNING_KEY_VARIABLE,
  signerFromEnvironment,
  verifierFromCertificate,
} from "./update-signing";
import type { Verify } from "./update-signing";

type Env = Readonly<Record<string, string | undefined>>;

/** The Cloudflare account the stacks live in; not a secret (`alchemy.ci.ts`). */
const CLOUDFLARE_ACCOUNT_ID = "984b82870acd18daf8bda97bad966b38";
const PRODUCTION_ORIGIN = "https://pcobooster.com";

/** Credentials no step but the signer may see; Alchemy uses the operator's login instead. */
const WITHHELD = new Set([
  SIGNING_KEY_VARIABLE,
  "CLOUDFLARE_API_TOKEN",
  "EXPO_PUBLIC_PCOB_RELEASE_SMOKE",
]);

/** The environment without the signing key or a Cloudflare token. */
export const withoutCredentials = (env: Env): Env =>
  Object.fromEntries(
    Object.entries(env).filter(([name]) => !WITHHELD.has(name))
  );

export interface UpdateCheckout {
  readonly head: string;
  readonly originMain: string;
  readonly dirty: boolean;
}

/** A directory relative to the repository root that a step runs in. */
export type StepDirectory = "." | "apps/mobile";

export interface PublishDependencies {
  /** Fetches origin/main and reports where this checkout stands. */
  readonly checkout: () => UpdateCheckout;
  /** Runs one step with its output visible; throws when it fails. */
  readonly run: (
    command: string,
    args: readonly string[],
    env: Env,
    directory: StepDirectory
  ) => void;
  /** Runs one step and returns what it printed; throws when it fails. */
  readonly output: (
    command: string,
    args: readonly string[],
    env: Env,
    directory: StepDirectory
  ) => string;
  /** The commit production's API serves (`/version`). */
  readonly productionRevision: () => Promise<string>;
  /** The export's `metadata.json` and the files it names, from `apps/mobile/<directory>`. */
  readonly readExport: (directory: string) => {
    readonly metadata: string;
    readonly files: (relative: string) => Uint8Array;
  };
  /** Saves the prepared release; returns the file the publishing stack reads. */
  readonly saveRelease: (release: PreparedRelease) => string;
  readonly confirm: (summary: string, code: string) => Promise<boolean>;
  readonly checkLive: (
    origin: string,
    runtimeVersion: string,
    expected: ExpectedAnswer
  ) => Promise<void>;
  readonly now: () => Date;
  readonly log: (line: string) => void;
}

export interface PublishOptions {
  readonly env: Env;
  readonly stage: UpdateStage;
  readonly rollback: boolean;
  /** For a rollback, the runtime version to roll back; this checkout's by default. */
  readonly runtimeVersion?: string;
  /** The product origin of the local stack, for `--stage local`. */
  readonly localOrigin: string;
  readonly sign: Sign;
  readonly verify: Verify;
}

export interface PublishResult {
  readonly stage: UpdateStage;
  readonly runtimeVersion: string;
  readonly revision: string;
  readonly summary: string;
}

const runtimeVersionSchema = Schema.Struct({ runtimeVersion: Schema.String });
const decodeRuntimeVersion = Schema.decodeUnknownSync(
  Schema.fromJsonString(runtimeVersionSchema)
);

const HERMES_MAGIC = Buffer.from("c61fbc03c103191f", "hex");

const assertLocalRun = (env: Env): void => {
  const marker = automationMarker(env);
  if (marker !== null) {
    throw new Error(
      `${marker} marks this run as automation. Updates are published from a person's Mac.`
    );
  }
  releaseAnalyticsKey(env);
};

const assertOnOriginMain = (checkout: UpdateCheckout, when: string): void => {
  if (checkout.dirty) {
    throw new Error(
      `The checkout has changes ${when}. Publish only committed source.`
    );
  }
  if (checkout.head !== checkout.originMain) {
    throw new Error(
      `HEAD ${checkout.head} is not origin/main ${checkout.originMain}. Publish only what main deployed.`
    );
  }
};

/** Signs `published`, then checks every signature against the builds' certificate. */
const verified = (
  published: PublishedUpdate,
  verify: Verify
): PublishedUpdate => {
  const parts =
    published._tag === "Update"
      ? [published.manifest, published.noUpdateAvailable]
      : [published.directive, published.noUpdateAvailable];
  if (!parts.every((part) => verify(part.body, part.signature))) {
    throw new Error(
      "A signature does not verify against certs/updates-certificate.pem. Nothing was published."
    );
  }
  return published;
};

interface Exported {
  readonly published: PublishedUpdate;
  readonly uploads: readonly Upload[];
  readonly updateId: string;
}

/** Exports this checkout's bundle, gates it, and signs the update for `runtimeVersion`. */
const exportUpdate = (
  deps: PublishDependencies,
  options: PublishOptions,
  context: {
    readonly env: Env;
    readonly origin: string;
    readonly revision: string;
    readonly runtimeVersion: string;
  }
): Exported => {
  const directory = `build/updates/${context.revision}`;
  const exportDirectory = `${directory}/export`;
  deps.run("rm", ["-rf", directory], context.env, "apps/mobile");
  deps.run(
    "bunx",
    [
      "expo",
      "export",
      "--platform",
      "ios",
      "--output-dir",
      exportDirectory,
      "--dump-sourcemap",
    ],
    context.env,
    "apps/mobile"
  );
  const exported = deps.readExport(exportDirectory);
  const { ios } = decodeExportMetadata(exported.metadata).fileMetadata;
  const launch: ExportedFile = {
    path: path.join(exportDirectory, ios.bundle),
    bytes: exported.files(ios.bundle),
  };
  if (!Buffer.from(launch.bytes.subarray(0, 8)).equals(HERMES_MAGIC)) {
    throw new Error(`${ios.bundle} is not Hermes bytecode.`);
  }
  const analyticsKey = releaseAnalyticsKey(options.env);
  if (!Buffer.from(launch.bytes).includes(analyticsKey)) {
    throw new Error(
      "The exported JavaScript does not embed the PostHog project key; analytics and diagnostics would be off. Nothing was published."
    );
  }
  deps.log("==> Release Hermes gate (exported bytecode)");
  deps.run(
    "bun",
    ["run", "scripts/hermes-gate/gate.ts", "--bundle", launch.path],
    context.env,
    "apps/mobile"
  );
  const expoClient = decodePublicAppConfig(
    deps.output(
      "bunx",
      ["expo", "config", "--type", "public", "--json"],
      context.env,
      "apps/mobile"
    )
  );
  const { manifest, uploads } = buildManifest({
    runtimeVersion: context.runtimeVersion,
    createdAt: deps.now(),
    origin: context.origin,
    revision: context.revision,
    expoClient,
    launch,
    assets: ios.assets.map((asset) => ({
      path: path.join(exportDirectory, asset.path),
      bytes: exported.files(asset.path),
      ext: asset.ext,
    })),
  });
  return {
    published: verified(
      publishedUpdate(manifest, options.sign),
      options.verify
    ),
    uploads,
    updateId: manifest.id,
  };
};

const expectedAnswer = (published: PublishedUpdate): ExpectedAnswer =>
  published._tag === "Update"
    ? {
        kind: "update",
        updateId: published.updateId,
        manifest: published.manifest.body,
        noUpdateAvailable: published.noUpdateAvailable.body,
      }
    : {
        kind: "rollBackToEmbedded",
        directive: published.directive.body,
        noUpdateAvailable: published.noUpdateAvailable.body,
      };

export const runUpdatePublish = async (
  deps: PublishDependencies,
  options: PublishOptions
): Promise<PublishResult> => {
  assertLocalRun(options.env);
  const production = options.stage === "prod";
  const plain = withoutCredentials(options.env);
  const before = deps.checkout();
  if (production && !options.rollback) {
    assertOnOriginMain(before, "before publishing");
    const served = await deps.productionRevision();
    if (served !== before.head) {
      throw new Error(
        `Production serves ${served}, not ${before.head}. Wait for main's deploy to finish so the update never runs ahead of its API.`
      );
    }
  }
  if (
    options.rollback &&
    options.runtimeVersion === undefined &&
    before.dirty
  ) {
    throw new Error(
      "The checkout has changes, so its runtime version may match no build. Commit or stash them, or pass --runtime-version."
    );
  }
  const origin = production ? PRODUCTION_ORIGIN : options.localOrigin;
  const releaseEnv = {
    ...plain,
    NODE_ENV: "production",
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_POSTHOG_KEY: releaseAnalyticsKey(options.env),
    EXPO_PUBLIC_SOURCE_REVISION: before.head,
  };
  // A rehearsal build asks the local stack, so its fingerprint is a different runtime version.
  const exportEnv = production
    ? releaseEnv
    : { ...releaseEnv, PCOB_UPDATES_URL: `${origin}/api/updates/manifest` };
  if (production && !options.rollback) {
    deps.log("==> Preflight: install, CI, and the Release simulator smoke");
    deps.run("bun", ["install", "--frozen-lockfile"], plain, ".");
    deps.run("bun", ["run", "ci"], plain, ".");
    deps.run(
      "bun",
      ["run", "--cwd", "apps/mobile", "ios:release-smoke", "--build"],
      plain,
      "."
    );
    const preflighted = deps.checkout();
    assertOnOriginMain(preflighted, "after preflight");
    if (preflighted.head !== before.head) {
      throw new Error("HEAD moved during preflight; publish again.");
    }
  }
  const runtimeVersion =
    options.runtimeVersion ??
    decodeRuntimeVersion(
      deps.output(
        "bunx",
        ["expo-updates", "runtimeversion:resolve", "--platform", "ios"],
        exportEnv,
        "apps/mobile"
      )
    ).runtimeVersion;
  if (!isRuntimeVersion(runtimeVersion)) {
    throw new Error(`${runtimeVersion} is not a runtime version fingerprint.`);
  }

  let published: PublishedUpdate;
  let uploads: readonly Upload[] = [];
  let summary: string;
  let code: string;
  if (options.rollback) {
    published = verified(
      publishedRollBack(deps.now(), options.sign),
      options.verify
    );
    summary = "roll back to the JavaScript each build shipped with";
    code = runtimeVersion.slice(0, 8);
  } else {
    const exported = exportUpdate(deps, options, {
      env: exportEnv,
      origin,
      revision: before.head,
      runtimeVersion,
    });
    ({ published, uploads } = exported);
    summary = `update ${exported.updateId}`;
    code = exported.updateId.slice(0, 8);
  }

  const release: PreparedRelease = {
    stage: options.stage,
    runtimeVersion,
    revision: before.head,
    summary,
    record: encodePublishedUpdate(published),
    uploads,
  };
  const releasePath = deps.saveRelease(release);
  if (
    !(await deps.confirm(
      `Publish to ${options.stage} for runtime version ${runtimeVersion}: ${summary}, from ${before.head}.`,
      code
    ))
  ) {
    throw new Error("Not confirmed. Nothing was published.");
  }
  deps.log(`==> Publishing to ${options.stage}`);
  const deployEnv = { ...plain, [RELEASE_VARIABLE]: releasePath };
  deps.run(
    "bun",
    [
      "alchemy",
      "deploy",
      "alchemy.mobile-updates.ts",
      "--stage",
      options.stage,
      "--yes",
    ],
    production ? { ...deployEnv, CLOUDFLARE_ACCOUNT_ID } : deployEnv,
    "."
  );
  deps.log("==> Checking what phones now get");
  await deps.checkLive(origin, runtimeVersion, expectedAnswer(published));
  return {
    stage: options.stage,
    runtimeVersion,
    revision: before.head,
    summary,
  };
};

const mobile = path.resolve(import.meta.dirname, "../..");
const repo = path.resolve(mobile, "../..");

const git = (args: readonly string[]): string => {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
};

/** Exactly the given variables: what `env` leaves out, the step does not see. */
const spawnStep = (
  command: string,
  args: readonly string[],
  env: Env,
  directory: StepDirectory,
  capture: boolean
): string => {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(childEnv)) {
    Reflect.deleteProperty(childEnv, name);
  }
  Object.assign(childEnv, env);
  const step = spawnSync(command, args, {
    cwd: path.join(repo, directory),
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf-8",
    env: childEnv,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (step.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${step.status}.`);
  }
  return capture ? step.stdout : "";
};

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const confirmOnTerminal = async (
  summary: string,
  code: string
): Promise<boolean> => {
  console.error(summary);
  if (process.argv.includes("--yes")) {
    return true;
  }
  if (!process.stdin.isTTY) {
    throw new Error("Confirm on a terminal, or pass --yes.");
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = await prompt.question(`Type ${code} to publish: `);
    return answer.trim() === code;
  } finally {
    prompt.close();
  }
};

/** Whether this checkout is a linked worktree, whose `.git` is a file. */
const linkedWorktree = (): boolean => {
  try {
    return statSync(path.join(repo, ".git")).isFile();
  } catch {
    return false;
  }
};

/** The product origin `bun run dev` serves for this checkout (`scripts/cloudflare/dev-launch.ts`). */
const localOrigin = (env: Env): string => {
  let base = DEFAULT_DEV_PORT_BASE;
  if ((env.DEV_PORT_BASE ?? "").trim() !== "") {
    base = parseDevPortBase(env.DEV_PORT_BASE);
  } else if (linkedWorktree()) {
    base = worktreeDevPortBase(repo);
  }
  return devOrigin(devPorts(base).web);
};

const main = async (): Promise<void> => {
  const stageArgument = argument("--stage") ?? "prod";
  if (stageArgument !== "prod" && stageArgument !== "local") {
    throw new Error("--stage is prod or local.");
  }
  const sign = signerFromEnvironment(process.env);
  const verify = verifierFromCertificate(
    readFileSync(CERTIFICATE_PATH, "utf-8")
  );
  const result = await runUpdatePublish(
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
      run: (command, args, env, directory) => {
        spawnStep(command, args, env, directory, false);
      },
      output: (command, args, env, directory) =>
        spawnStep(command, args, env, directory, true),
      productionRevision: async () => {
        const response = await fetch(`${PRODUCTION_ORIGIN}/version`);
        const served = await response.text();
        return served.trim();
      },
      readExport: (directory) => {
        const root = path.join(mobile, directory);
        return {
          metadata: readFileSync(path.join(root, "metadata.json"), "utf-8"),
          files: (relative) => readFileSync(path.join(root, relative)),
        };
      },
      saveRelease: (release) => {
        const directory = path.join(mobile, "build/updates", release.revision);
        mkdirSync(directory, { recursive: true });
        const file = path.join(directory, `release-${release.stage}.json`);
        writeFileSync(
          file,
          encodePreparedRelease({
            ...release,
            uploads: release.uploads.map((upload) => ({
              ...upload,
              path: path.join(mobile, upload.path),
            })),
          })
        );
        return file;
      },
      confirm: confirmOnTerminal,
      checkLive: async (origin, runtimeVersion, expected) => {
        const report = await checkLiveUpdate({
          origin,
          runtimeVersion,
          expected,
          verify,
          fetch,
        });
        console.error(
          `Verified: ${report.answers.join("; ")}; ${report.assets} assets match their hashes.`
        );
      },
      now: () => new Date(),
      log: (line) => {
        console.error(line);
      },
    },
    {
      env: process.env,
      stage: stageArgument,
      rollback: process.argv.includes("--rollback"),
      runtimeVersion: argument("--runtime-version"),
      localOrigin: localOrigin(process.env),
      sign,
      verify,
    }
  );
  console.log(JSON.stringify(result, null, 2));
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
