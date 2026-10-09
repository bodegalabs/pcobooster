/**
 * What production tells iOS builds of a runtime version, read the way a phone asks: nothing, an
 * update (its id, when it was published, and the commit it came from), or a rollback, with whether
 * its signature verifies against the certificate builds embed. Read-only; needs no credentials.
 *
 *   bun run ios:update:status [--runtime-version <fingerprint>]
 *
 * Without `--runtime-version` it asks for this checkout's, which matches the builds made from it.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { Schema } from "effect";

import { readLiveAnswer } from "./live-check";
import { CERTIFICATE_PATH, verifierFromCertificate } from "./update-signing";

const PRODUCTION_ORIGIN = "https://pcobooster.com";
const mobile = path.resolve(import.meta.dirname, "../..");

const decodeRuntimeVersion = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ runtimeVersion: Schema.String }))
);

const checkoutRuntimeVersion = (): string => {
  const env = { ...process.env };
  Reflect.deleteProperty(env, "EXPO_PUBLIC_PCOB_RELEASE_SMOKE");
  Reflect.deleteProperty(env, "PCOB_UPDATES_URL");
  const result = spawnSync(
    "bunx",
    ["expo-updates", "runtimeversion:resolve", "--platform", "ios"],
    { cwd: mobile, env, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(`Resolving the runtime version failed: ${result.stderr}`);
  }
  return decodeRuntimeVersion(result.stdout).runtimeVersion;
};

const main = async (): Promise<void> => {
  const index = process.argv.indexOf("--runtime-version");
  const runtimeVersion =
    index === -1 ? checkoutRuntimeVersion() : (process.argv[index + 1] ?? "");
  const answer = await readLiveAnswer({
    origin: PRODUCTION_ORIGIN,
    runtimeVersion,
    verify: verifierFromCertificate(readFileSync(CERTIFICATE_PATH, "utf-8")),
    fetch,
  });
  console.log(JSON.stringify({ runtimeVersion, ...answer }, null, 2));
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
