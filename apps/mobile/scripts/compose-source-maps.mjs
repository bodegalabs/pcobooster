// React Native's Xcode bundling step runs this instead of its own compose script when the
// archive sets `COMPOSE_SOURCEMAP_PATH` to it (react-native-xcode.sh honors that variable), with
// the same arguments: `<packager map> <Hermes map> -o <composed map>`.
//
// React Native deletes the packager map after composing, and its compose script drops the
// bundle's debug ID; `posthog-cli hermes clone` needs both. This keeps a copy of the packager map
// at `PCOB_PACKAGER_SOURCEMAP_COPY`, then composes exactly as React Native would. Nothing in
// `node_modules` is patched.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const [packagerMap] = process.argv.slice(2);
const copy = String(process.env.PCOB_PACKAGER_SOURCEMAP_COPY ?? "");
if (packagerMap === undefined || copy === "") {
  throw new Error(
    "compose-source-maps needs the packager map argument and PCOB_PACKAGER_SOURCEMAP_COPY."
  );
}
mkdirSync(path.dirname(copy), { recursive: true });
copyFileSync(packagerMap, copy);

const reactNativeCompose = createRequire(import.meta.url).resolve(
  "react-native/scripts/compose-source-maps.js"
);
execFileSync(process.execPath, [reactNativeCompose, ...process.argv.slice(2)], {
  stdio: "inherit",
});
