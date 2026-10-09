import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

import { Option, Schema } from "effect";

import { keychainService, processExit, scopeKeys } from "./manifest";
import type { SecretScope } from "./manifest";

// Decoded without throwing: a failure message would echo the secret values in the reply.
const decodeReply = Schema.decodeUnknownOption(
  Schema.Struct({ values: Schema.Record(Schema.String, Schema.String) })
);

const keychain = async (
  scope: SecretScope,
  operation: "read" | "write",
  values?: Readonly<Record<string, string>>
): Promise<Record<string, string>> => {
  if (process.platform !== "darwin") {
    throw new Error(
      "macOS Keychain is available only on a Mac. Cloud commands receive their development credentials from the host environment."
    );
  }
  const child = spawn(
    "/usr/bin/swift",
    [path.join(import.meta.dirname, "keychain.swift")],
    { stdio: ["pipe", "pipe", "pipe"] }
  );
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    output.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    errors.push(chunk);
  });
  const exited = once(child, "close");
  child.stdin.end(
    JSON.stringify({
      operation,
      service: keychainService(scope),
      keys:
        operation === "write" ? Object.keys(values ?? {}) : scopeKeys[scope],
      values,
    })
  );
  const [code] = processExit(await exited);
  if (code !== 0) {
    throw new Error(
      `Keychain helper failed. ${Buffer.concat(errors).toString().trim()}`
    );
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.concat(output).toString());
  } catch {
    throw new Error("Keychain returned an invalid reply");
  }
  const reply = decodeReply(decoded);
  if (Option.isNone(reply)) {
    throw new Error("Keychain returned an invalid reply");
  }
  return { ...reply.value.values };
};

export const readKeychain = async (
  scope: SecretScope
): Promise<Record<string, string>> => await keychain(scope, "read");
export const writeKeychain = async (
  scope: SecretScope,
  values: Readonly<Record<string, string>>
): Promise<Record<string, string>> => await keychain(scope, "write", values);
