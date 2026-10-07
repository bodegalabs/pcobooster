/**
 * The sole iOS release executor, as `.github/workflows/ios-release.yml` runs it.
 *
 * Usage: bun run scripts/release/ci-cli.ts <command>
 *   release                         Claim, archive, export, verify, and upload one build.
 *   availability [--timeout-minutes <n>]
 *                                   Wait, bounded, for App Store Connect to process it.
 *   reconcile                       Compare the ledger with App Store Connect. Reads only.
 *
 * `release` and `availability` write the ledger and are refused while `RELEASE_ENABLEMENT` is
 * blocked, before any credential is read. They read the ledger through `PCOB_RELEASE_LEDGER_TOKEN`
 * (`GITHUB_REPOSITORY`, `GITHUB_API_URL`), App Store Connect through the ASC_* key, and source
 * maps upload through POSTHOG_CLI_*. Nothing here prints a credential.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { Schema } from "effect";

import { directoryMapProblems, mapsIn, sha256 } from "../source-maps";
import { verifySmokeEvidence, sourceState } from "./artifact-provenance";
import {
  ascKeyFromEnv,
  buildState,
  findAppId,
  makeAscClient,
  takenBuildNumbers,
} from "./asc";
import type { AscKey } from "./asc";
import { makeAltoolUploader, runIdentityFromEnv } from "./ci-adapters";
import type { LedgerStore } from "./ci-ledger";
import {
  assertReleaseEnabled,
  awaitProcessing,
  reconcile,
  runRelease,
} from "./ci-release";
import { LEDGER_BRANCH, makeGitHubLedgerStore } from "./ledger-github";
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
const DEFAULT_PROCESSING_MINUTES = 30;
const MAX_PROCESSING_MINUTES = 90;

const mobile = path.resolve(import.meta.dirname, "../..");
const repo = path.resolve(mobile, "../..");
const out = path.join(mobile, "build/release");

const decodeString = Schema.decodeUnknownSync(Schema.String);

/** An environment variable's value, or empty when unset. */
const environment = (name: string): string =>
  decodeString(process.env[name] ?? "");

const setting = (name: string): string => {
  const value = environment(name);
  if (value === "") {
    throw new Error(`${name} must be set.`);
  }
  return value;
};

const ledgerStore = (): LedgerStore =>
  makeGitHubLedgerStore({
    api: environment("GITHUB_API_URL") || "https://api.github.com",
    repository: setting("GITHUB_REPOSITORY"),
    branch: LEDGER_BRANCH,
    token: setting("PCOB_RELEASE_LEDGER_TOKEN"),
  });

const appStoreConnect = async () => {
  const key: AscKey | null = ascKeyFromEnv(process.env);
  if (key === null) {
    throw new Error("The release executor needs an App Store Connect key.");
  }
  const client = makeAscClient(key);
  const appId = await findAppId(client, BUNDLE_ID);
  return {
    key,
    builds: async () => await takenBuildNumbers(client, appId),
    state: async (build: number) => await buildState(client, appId, build),
  };
};

/** Runs a step of the release with its output visible in the job log. */
const step = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
) => {
  const result = spawnSync(command, args, {
    cwd: mobile,
    stdio: "inherit",
    env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}.`);
  }
};

const smokeEvidence = (revision: string) => ({
  dir: path.join(mobile, ".captures/release-smoke", revision),
  app: path.join(
    mobile,
    "build/derived/Build/Products/Release-iphonesimulator/PCOBooster.app"
  ),
});

const APPLE_KEYS = [
  "ASC_KEY_ID",
  "ASC_ISSUER_ID",
  "ASC_KEY_PATH",
  "ASC_KEY_P8_BASE64",
];
const SYMBOL_KEYS = ["POSTHOG_CLI_API_KEY", "POSTHOG_CLI_PROJECT_ID"];
const LEDGER_KEYS = ["PCOB_RELEASE_LEDGER_TOKEN"];

/** The job environment without credentials a step does not need. */
const without = (names: readonly string[]): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const name of names) {
    Reflect.deleteProperty(env, name);
  }
  return env;
};

/** Archive and export see the Apple key, never the symbol-upload key or the ledger token. */
const withBuild = (build: number): NodeJS.ProcessEnv => ({
  ...without([...SYMBOL_KEYS, ...LEDGER_KEYS]),
  BUILD_NUMBER: String(build),
});

const release = async () => {
  assertReleaseEnabled();
  const run = runIdentityFromEnv(process.env);
  const asc = await appStoreConnect();
  const paths = releasePaths(out);
  const result = await runRelease(
    {
      ledger: ledgerStore(),
      appStoreConnectBuilds: asc.builds,
      preflight: async () => {
        await Promise.resolve();
        const source = sourceState(repo);
        if (source.revision !== run.sha || source.dirty) {
          throw new Error(
            `The checkout is not the clean dispatched revision ${run.sha}.`
          );
        }
        const smoke = smokeEvidence(run.sha);
        verifySmokeEvidence(
          smoke.dir,
          readFileSync(`${smoke.dir}.sha256`, "utf-8").trim(),
          source,
          smoke.app
        );
      },
      archive: async (build) => {
        await Promise.resolve();
        step("bash", ["scripts/release-ios.sh", "--prepare"], withBuild(build));
      },
      exportSigned: async (build) => {
        await Promise.resolve();
        step(
          "bash",
          ["scripts/release-ios.sh", "--no-upload", "--skip-build"],
          {
            ...withBuild(build),
            PCOB_RELEASE_SIGNING: "api-key",
          }
        );
      },
      verifyExport: async (build) => {
        await Promise.resolve();
        return verifySignedExport({
          repo,
          out,
          expected: {
            bundleId: BUNDLE_ID,
            version: VERSION,
            build,
            teamId: TEAM_ID,
            sourceSha: run.sha,
          },
          hermesEvidence: path.join(
            mobile,
            "build/hermes-gate/runs",
            run.sha,
            "evidence.json"
          ),
          smoke: smokeEvidence(run.sha),
          frameworksWithoutDsyms: [],
          run: runCommand,
        });
      },
      uploadSymbols: async () => {
        await Promise.resolve();
        const bundle = path.join(paths.app, "main.jsbundle");
        step(
          "bun",
          [
            "run",
            "scripts/source-maps.ts",
            "upload",
            "--maps",
            paths.maps,
            "--bundle",
            bundle,
          ],
          without([...APPLE_KEYS, ...LEDGER_KEYS])
        );
        const problems = directoryMapProblems(paths.maps, bundle, true);
        if (problems.length > 0) {
          throw new Error(
            `Uploaded maps no longer match: ${problems.join(" ")}`
          );
        }
        return {
          clonedMapSha256: sha256(readFileSync(mapsIn(paths.maps).composed)),
          uploadedAt: new Date().toISOString(),
        };
      },
      assertUnchanged: async (identity) => {
        await Promise.resolve();
        assertUnchanged(out, identity);
      },
      upload: makeAltoolUploader({ run: runCommand, key: asc.key, out }),
      now: () => new Date(),
      log: (line) => {
        console.error(line);
      },
    },
    { run, bundleId: BUNDLE_ID, version: VERSION }
  );
  console.log(JSON.stringify(result, null, 2));
};

const minutes = (args: readonly string[]): number => {
  const index = args.indexOf("--timeout-minutes");
  const value =
    index === -1 ? DEFAULT_PROCESSING_MINUTES : Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PROCESSING_MINUTES) {
    throw new Error(
      `--timeout-minutes must be a whole number from 1 to ${MAX_PROCESSING_MINUTES}.`
    );
  }
  return value;
};

const availability = async (args: readonly string[]) => {
  assertReleaseEnabled();
  const timeout = minutes(args);
  const run = runIdentityFromEnv(process.env);
  const asc = await appStoreConnect();
  const report = await awaitProcessing(
    {
      ledger: ledgerStore(),
      buildState: asc.state,
      sleep: async (ms) => {
        await sleep(ms);
      },
      now: () => new Date(),
    },
    {
      run,
      bundleId: BUNDLE_ID,
      version: VERSION,
      timeoutMs: timeout * MINUTE_MS,
      intervalMs: MINUTE_MS,
    }
  );
  const text = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(path.join(out, "availability.json"), text);
  console.log(text);
  if (report.status !== "processed") {
    process.exitCode = 1;
  }
};

const reconcileCommand = async () => {
  const asc = await appStoreConnect();
  const entries = await reconcile(
    {
      ledger: ledgerStore(),
      appStoreConnectBuilds: asc.builds,
      buildState: asc.state,
    },
    BUNDLE_ID
  );
  console.log(JSON.stringify(entries, null, 2));
};

type Command = (args: readonly string[]) => Promise<void>;

const commands = {
  release,
  availability,
  reconcile: reconcileCommand,
} satisfies Record<string, Command>;

const isCommandName = (value: string): value is keyof typeof commands =>
  Object.hasOwn(commands, value);

if (import.meta.main) {
  const [name = "", ...rest] = process.argv.slice(2);
  const command: Command | undefined = isCommandName(name)
    ? commands[name]
    : undefined;
  if (command === undefined) {
    console.error("Usage: ci-cli.ts release|availability|reconcile");
    process.exitCode = 64;
  } else {
    try {
      await command(rest);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
