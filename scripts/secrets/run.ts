import { spawn } from "node:child_process";
import { once } from "node:events";

import { z } from "zod";

import { readKeychain } from "./keychain";
import {
  commandEnvironment,
  requiredScopeKeys,
  secretScopeSchema,
  selectScopeValues,
} from "./manifest";

const [scopeInput, separator, command, ...args] = process.argv.slice(2);
const scope = secretScopeSchema.parse(scopeInput);
if (separator !== "--" || command === undefined) {
  throw new Error("Usage: secrets:run <scope> -- <command> [arguments]");
}
if (process.platform !== "darwin" && scope !== "cloud") {
  throw new Error(
    "Use GitHub environment secrets for deployed jobs; this scope requires macOS Keychain locally."
  );
}
const values =
  process.platform === "darwin"
    ? await readKeychain(scope)
    : selectScopeValues(
        scope,
        Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined
          )
        )
      );
const missing = requiredScopeKeys[scope].filter((key) => !values[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing ${scope} credentials: ${missing.join(", ")}. Run secrets:migrate to import existing values, or secrets:set to enter one securely.`
  );
}
const child = spawn(command, args, {
  stdio: "inherit",
  env: commandEnvironment(scope, process.env, values),
});
const stop = (signal: NodeJS.Signals): void => {
  child.kill(signal);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const [code] = z
  .tuple([z.number().nullable(), z.string().nullable()])
  .parse(await once(child, "exit"));
process.exitCode = code ?? 1;
