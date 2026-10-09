import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { Option, Schema } from "effect";

import { writeKeychain } from "./keychain";
import { parseSecretScope, scopeKeys } from "./manifest";

// Never decoded with a throwing decoder: its failure message would echo the typed secret.
const lineEvent = Schema.decodeUnknownOption(Schema.Tuple([Schema.String]));

const [scopeInput, key, mode] = process.argv.slice(2);
const scope = parseSecretScope(scopeInput);
if (key === undefined || !scopeKeys[scope].includes(key)) {
  throw new Error(
    "Choose a key listed for this scope in scripts/secrets/manifest.ts"
  );
}
let value: string;
if (mode === "--stdin") {
  value = readFileSync(0, "utf-8").replace(/\r?\n$/u, "");
} else {
  if (mode !== undefined || !process.stdin.isTTY) {
    throw new Error(
      "Usage: secrets:set <scope> <KEY> [--stdin]. Values are never accepted as command arguments."
    );
  }
  const terminal = spawnSync("/bin/stty", ["-echo"], { stdio: "inherit" });
  if (terminal.status !== 0) {
    throw new Error("Unable to hide terminal input; use --stdin");
  }
  process.stderr.write(`Enter ${key} (hidden): `);
  const input = createInterface({ input: process.stdin, terminal: false });
  try {
    const line = lineEvent(await once(input, "line"));
    if (Option.isNone(line)) {
      throw new Error("Unable to read the entered value");
    }
    [value] = line.value;
  } finally {
    input.close();
    spawnSync("/bin/stty", ["echo"], { stdio: "inherit" });
    process.stderr.write("\n");
  }
}
if (value === "") {
  throw new Error("Secret values must be nonempty");
}
const written = await writeKeychain(scope, { [key]: value });
if (written[key] !== value) {
  throw new Error("Keychain verification failed");
}
process.stdout.write(`Saved ${scope}/${key} in macOS Keychain.\n`);
