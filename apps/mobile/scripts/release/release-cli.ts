/**
 * The release steps `release-ios.sh` runs outside Xcode. Every App Store Connect call is a read.
 *
 * Usage: bun run scripts/release/release-cli.ts <command>
 *   signing [--has-key]                         Prints api-key or xcode-account.
 *   lock acquire --pid <pid> --revision <sha>   Takes this machine's release lock.
 *   lock release --pid <pid>
 *   build-number choose --pid <pid> --revision <sha> [--requested <n>]
 *                                               Prints and claims the release's build number.
 *   build-number verify --build <n>             Fails if App Store Connect now has it, or higher.
 *   status --build <n>                          Prints the build's processing and TestFlight state.
 *
 * App Store Connect reads use ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_PATH or ASC_KEY_P8_BASE64
 * from the environment this command alone receives.
 */
import { readFileSync } from "node:fs";
import process from "node:process";

import { Schema } from "effect";

import { buildState, findAppId, makeAscClient, takenBuildNumbers } from "./asc";
import type { AscClient } from "./asc";
import {
  chooseBuildNumber,
  parseBuildNumber,
  signingMode,
  stillUnused,
} from "./release-rules";
import {
  acquireLock,
  assertLockHeld,
  claimedBuildNumbers,
  recordClaim,
  releaseLock,
  releaseStateDir,
} from "./release-state";

const BUNDLE_ID = "com.pcobooster.ios";

const option = (args: readonly string[], name: string): string | null => {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} needs a value`);
  }
  return value;
};

const required = (args: readonly string[], name: string): string => {
  const value = option(args, name);
  if (value === null) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const pidOption = (args: readonly string[]): number => {
  const pid = Number(required(args, "--pid"));
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("--pid must be a process id");
  }
  return pid;
};

const decodeString = Schema.decodeUnknownSync(Schema.String);

/** An environment variable's value, or empty when unset. */
const environment = (name: string): string =>
  decodeString(process.env[name] ?? "");

/** The App Store Connect reader and the app's id, or null without a key. */
const appStoreConnect = async (): Promise<{
  client: AscClient;
  appId: string;
} | null> => {
  const keyId = environment("ASC_KEY_ID");
  const issuerId = environment("ASC_ISSUER_ID");
  const keyPath = environment("ASC_KEY_PATH");
  const keyBase64 = environment("ASC_KEY_P8_BASE64");
  if (`${keyId}${issuerId}${keyPath}${keyBase64}` === "") {
    return null;
  }
  if (
    keyId === "" ||
    issuerId === "" ||
    (keyPath === "") === (keyBase64 === "")
  ) {
    throw new Error(
      "Supply ASC_KEY_ID, ASC_ISSUER_ID, and one of ASC_KEY_PATH or ASC_KEY_P8_BASE64."
    );
  }
  const client = makeAscClient({
    keyId,
    issuerId,
    // The base64 key is decoded in memory and never written to disk.
    privateKey:
      keyPath === ""
        ? Buffer.from(keyBase64, "base64").toString("utf-8")
        : readFileSync(keyPath, "utf-8"),
  });
  return { client, appId: await findAppId(client, BUNDLE_ID) };
};

type Command = (args: readonly string[]) => Promise<void>;

const commands = {
  signing: async (args) => {
    await Promise.resolve();
    console.log(
      signingMode({ env: process.env, hasKey: args.includes("--has-key") })
    );
  },
  lock: async (args) => {
    await Promise.resolve();
    const dir = releaseStateDir();
    const pid = pidOption(args);
    if (args[0] === "acquire") {
      acquireLock(dir, {
        pid,
        revision: required(args, "--revision"),
        startedAt: new Date().toISOString(),
      });
    } else if (args[0] === "release") {
      releaseLock(dir, pid);
    } else {
      throw new Error("lock acquire|release");
    }
  },
  "build-number": async (args) => {
    const asc = await appStoreConnect();
    const used =
      asc === null ? null : await takenBuildNumbers(asc.client, asc.appId);
    if (args[0] === "choose") {
      const dir = releaseStateDir();
      assertLockHeld(dir, pidOption(args));
      const requested = option(args, "--requested");
      const build = chooseBuildNumber(
        { appStoreConnect: used, claimed: claimedBuildNumbers(dir) },
        requested === null ? null : parseBuildNumber(requested)
      );
      recordClaim(dir, build, required(args, "--revision"), new Date());
      if (used === null) {
        console.error(
          `Build ${build} is above the floor and every local claim. Without an API key, App Store Connect was not checked; Apple rejects a used number at upload, and the release does not retry.`
        );
      }
      console.log(build);
    } else if (args[0] === "verify") {
      const build = parseBuildNumber(required(args, "--build"));
      if (used === null) {
        console.error(
          `Build ${build} was not rechecked against App Store Connect (no API key).`
        );
        return;
      }
      stillUnused(build, used);
      console.error(
        `Build ${build} is still above every App Store Connect build and upload.`
      );
    } else {
      throw new Error("build-number choose|verify");
    }
  },
  status: async (args) => {
    const asc = await appStoreConnect();
    if (asc === null) {
      throw new Error("status reads App Store Connect and needs an API key.");
    }
    const build = parseBuildNumber(required(args, "--build"));
    const state = await buildState(asc.client, asc.appId, build);
    console.log(JSON.stringify(state ?? { build, found: false }, null, 2));
    if (state === null) {
      process.exitCode = 1;
    }
  },
} satisfies Record<string, Command>;

const [name, ...rest] = process.argv.slice(2);
const isCommandName = (value: string): value is keyof typeof commands =>
  Object.hasOwn(commands, value);
const command: Command | undefined =
  name !== undefined && isCommandName(name) ? commands[name] : undefined;
if (command === undefined) {
  console.error("Usage: release-cli.ts signing|lock|build-number|status ...");
  process.exitCode = 64;
} else {
  try {
    await command(rest);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
