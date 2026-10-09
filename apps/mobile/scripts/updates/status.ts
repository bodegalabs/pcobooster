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

import { UPDATE_CHECK_PATH } from "@pcobooster/contracts/mobile-updates";
import { Schema } from "effect";

import { parseMultipart } from "./live-check";
import { CERTIFICATE_PATH, verifierFromCertificate } from "./update-signing";

const PRODUCTION_ORIGIN = "https://pcobooster.com";
const mobile = path.resolve(import.meta.dirname, "../..");

const decodeRuntimeVersion = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ runtimeVersion: Schema.String }))
);
const decodeUpdate = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      id: Schema.String,
      createdAt: Schema.String,
      extra: Schema.Struct({ revision: Schema.String }),
    })
  )
);
const decodeDirective = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      type: Schema.String,
      parameters: Schema.optional(
        Schema.Struct({ commitTime: Schema.optional(Schema.String) })
      ),
    })
  )
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
  const response = await fetch(`${PRODUCTION_ORIGIN}${UPDATE_CHECK_PATH}`, {
    headers: {
      accept: "multipart/mixed",
      "expo-protocol-version": "1",
      "expo-platform": "ios",
      "expo-runtime-version": runtimeVersion,
      "expo-expect-signature": 'sig, keyid="main", alg="rsa-v1_5-sha256"',
    },
  });
  if (response.status === 204) {
    console.log(
      JSON.stringify({ runtimeVersion, published: "nothing" }, null, 2)
    );
    return;
  }
  if (response.status !== 200) {
    throw new Error(
      `The update check answered ${response.status}: ${await response.text()}`
    );
  }
  const [part] = parseMultipart(
    response.headers.get("content-type") ?? "",
    await response.text()
  );
  if (part === undefined) {
    throw new Error("The update check answered with no parts.");
  }
  const verify = verifierFromCertificate(
    readFileSync(CERTIFICATE_PATH, "utf-8")
  );
  const signatureVerifies =
    part.signature !== undefined && verify(part.body, part.signature);
  if (part.name === "manifest") {
    const update = decodeUpdate(part.body);
    console.log(
      JSON.stringify(
        {
          runtimeVersion,
          published: "update",
          updateId: update.id,
          createdAt: update.createdAt,
          revision: update.extra.revision,
          signatureVerifies,
        },
        null,
        2
      )
    );
    return;
  }
  const directive = decodeDirective(part.body);
  console.log(
    JSON.stringify(
      {
        runtimeVersion,
        published: directive.type,
        commitTime: directive.parameters?.commitTime ?? null,
        signatureVerifies,
      },
      null,
      2
    )
  );
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
