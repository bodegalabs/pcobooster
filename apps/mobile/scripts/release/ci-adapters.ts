/**
 * The real edges of the release executor that are worth testing on their own: the dispatched
 * run's identity, the private key file the uploader reads, and the one uploader call.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { Schema } from "effect";

import { sha256 } from "../source-maps";
import type { AscKey } from "./asc";
import type { ArtifactIdentity, RunIdentity, UploadReceipt } from "./ci-ledger";
import { assertUnchanged, releasePaths } from "./signed-export";
import type { RunCommand } from "./signed-export";

const DispatchSchema = Schema.Struct({
  GITHUB_ACTIONS: Schema.Literal("true"),
  GITHUB_EVENT_NAME: Schema.Literal("workflow_dispatch"),
  GITHUB_REF: Schema.Literal("refs/heads/main"),
  GITHUB_RUN_ID: Schema.String.check(Schema.isPattern(/^[1-9]\d*$/u)),
  GITHUB_RUN_ATTEMPT: Schema.String.check(Schema.isPattern(/^[1-9]\d*$/u)),
  GITHUB_SHA: Schema.String.check(Schema.isPattern(/^[\da-f]{40}$/u)),
});
const decodeDispatch = Schema.decodeUnknownOption(DispatchSchema);

/**
 * The run as GitHub Actions describes a manual dispatch on `main`. These values can be spoofed
 * outside Actions; what stops a spoofed run is the enablement constant, the protected
 * environment's credentials, and the ledger branch's writer restriction, not this check.
 */
export const runIdentityFromEnv = (
  env: Readonly<Record<string, string | undefined>>
): RunIdentity => {
  const decoded = decodeDispatch(env);
  if (decoded._tag === "None") {
    throw new Error(
      "The release executor runs only in a GitHub Actions workflow_dispatch run on main."
    );
  }
  return {
    id: decoded.value.GITHUB_RUN_ID,
    attempt: Number(decoded.value.GITHUB_RUN_ATTEMPT),
    sha: decoded.value.GITHUB_SHA,
  };
};

const KEY_SIGNALS = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
} as const satisfies Partial<Record<NodeJS.Signals, number>>;

/**
 * Writes the App Store Connect key to a fresh owner-only folder for the duration of `withFile`,
 * and removes it afterwards whether `withFile` returns or throws. While it exists, an interrupt
 * or termination cannot end the process before the folder is removed: during a synchronous
 * upload the listener keeps the process alive until `finally` runs, and otherwise it removes the
 * folder and exits with the signal's status.
 */
export const withPrivateKeyFile = <T>(
  key: AscKey,
  withFile: (file: string) => T
): T => {
  const dir = mkdtempSync(path.join(tmpdir(), "pcob-upload-key-"));
  const remove = () => {
    rmSync(dir, { recursive: true, force: true });
  };
  const handlers = Object.entries(KEY_SIGNALS).map(([signal, status]) => {
    const handler = () => {
      remove();
      process.exit(status);
    };
    process.once(signal, handler);
    return () => process.off(signal, handler);
  });
  try {
    chmodSync(dir, 0o700);
    const file = path.join(dir, `AuthKey_${key.keyId}.p8`);
    writeFileSync(file, key.privateKey, { mode: 0o600 });
    return withFile(file);
  } finally {
    remove();
    for (const off of handlers) {
      off();
    }
  }
};

const DELIVERY_ID =
  /delivery[\s_-]*(?:uuid|id)["'\s:=]+(?<id>[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/iu;
const UPLOAD_ERROR = /"product-errors"|\bERROR:/u;

/** The delivery UUID altool printed, if any. */
export const deliveryId = (output: string): string | null =>
  DELIVERY_ID.exec(output)?.groups?.id ?? null;

export interface UploaderOptions {
  readonly run: RunCommand;
  readonly key: AscKey;
  /** The app's numeric App Store Connect id, which `altool --upload-package` requires. */
  readonly appId: string;
  /** `apps/mobile/build/release`; the uploader's output is retained beside the IPA. */
  readonly out: string;
}

/**
 * One `altool --upload-package` of the verified IPA. Any non-zero exit, or an error in output
 * that exited zero, throws; the caller treats that as an unknown outcome, never as a retry.
 * The retained IPA and manifest are rehashed synchronously right before the key is written and
 * altool runs, so nothing can change them between the last check and the upload.
 */
export const makeAltoolUploader =
  ({ run, key, appId, out }: UploaderOptions) =>
  async (identity: ArtifactIdentity): Promise<UploadReceipt> => {
    await Promise.resolve();
    const ipa = path.join(releasePaths(out).export, identity.ipaFileName);
    assertUnchanged(out, identity);
    const result = withPrivateKeyFile(key, (p8) =>
      run("xcrun", [
        "altool",
        "--upload-package",
        ipa,
        "--apple-id",
        appId,
        "--bundle-id",
        identity.bundleId,
        "--bundle-version",
        String(identity.build),
        "--bundle-short-version-string",
        identity.version,
        "--api-key",
        key.keyId,
        "--api-issuer",
        key.issuerId,
        "--p8-file-path",
        p8,
        "--output-format",
        "json",
      ])
    );
    const output = `${result.stdout}\n${result.stderr}`;
    writeFileSync(path.join(out, "upload-output.txt"), output);
    if (result.status !== 0 || UPLOAD_ERROR.test(output)) {
      throw new Error(
        `altool exited ${result.status}; see upload-output.txt (sha256 ${sha256(output)}).`
      );
    }
    return { deliveryId: deliveryId(output), outputSha256: sha256(output) };
  };
