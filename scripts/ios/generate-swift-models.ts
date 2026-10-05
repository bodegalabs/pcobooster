/**
 * `bun run ios:models`: regenerates the iOS app's Swift API models and `RPC` procedure
 * descriptors from `packages/contracts` into `PCOBoosterCore/Sources/PCOBoosterCore/API/Generated`.
 * Run it after any contract change; `generate-swift-models.test.ts` fails until you do.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  GENERATED_DIRECTORY,
  REPOSITORY_ROOT,
  generateSwiftModels,
} from "./swift-models/generate";

const files = await generateSwiftModels();
const directory = path.join(REPOSITORY_ROOT, GENERATED_DIRECTORY);
await mkdir(directory, { recursive: true });

// Swift files no module generates any more would otherwise keep compiling.
const generatedNames = new Set(files.map((file) => path.basename(file.path)));
const existingNames = await readdir(directory);
const staleNames = existingNames.filter(
  (name) => name.endsWith(".swift") && !generatedNames.has(name)
);
await Promise.all([
  ...staleNames.map(async (name) => {
    await rm(path.join(directory, name));
  }),
  ...files.map(async (file) => {
    await writeFile(path.join(REPOSITORY_ROOT, file.path), file.contents);
  }),
]);

process.stdout.write(
  `Wrote ${files.length} Swift files to ${GENERATED_DIRECTORY}${
    staleNames.length === 0 ? "" : `, removed ${staleNames.join(", ")}`
  }\n`
);
