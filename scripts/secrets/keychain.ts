import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

import { z } from "zod";

import { keychainService, scopeKeys } from "./manifest";
import type { SecretScope } from "./manifest";

const replySchema = z.object({ values: z.record(z.string(), z.string()) });

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
  const [code] = z
    .tuple([z.number().nullable(), z.string().nullable()])
    .parse(await exited);
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
  const parsed = replySchema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error("Keychain returned an invalid reply");
  }
  return parsed.data.values;
};

export const readKeychain = async (
  scope: SecretScope
): Promise<Record<string, string>> => await keychain(scope, "read");
export const writeKeychain = async (
  scope: SecretScope,
  values: Readonly<Record<string, string>>
): Promise<Record<string, string>> => await keychain(scope, "write", values);
