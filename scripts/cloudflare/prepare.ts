import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ignoredDirectories = new Set([
  "node_modules",
  ".tanstack",
  ".turbo",
  "dist",
]);
/** Variables the product and marketing builds inline (see their `vite.config.ts`). */
const inlinedVariables = [
  "PLANNING_CENTER_TIME_ZONE",
  "POSTHOG_PROJECT_KEY",
] as const;
const buildStampName = "cloudflare-build-inputs.json";

const hashDirectory = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const hashes = await Promise.all(
    entries
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        if (
          ignoredDirectories.has(entry.name) ||
          entry.name.endsWith(".tsbuildinfo") ||
          entry.name === buildStampName
        ) {
          return [];
        }
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          return await hashDirectory(filename);
        }
        if (!entry.isFile()) {
          return [];
        }
        const contents = await readFile(filename);
        return [
          `${filename}:${createHash("sha256").update(contents).digest("hex")}`,
        ];
      })
  );
  return hashes.flat();
};

/**
 * Alchemy's memo hashes files, not the environment: record the stage (which sets the admin
 * base path) and the variables the web build inlines, plus the marketing site the web build
 * stages, which it does not import.
 */
export const prepareCloudflareBuild = async (stage: string): Promise<void> => {
  const directories = await Promise.all(
    ["packages", "apps/marketing", "scripts"].map(hashDirectory)
  );
  const rootFiles = await Promise.all(
    ["package.json", "bun.lock", "turbo.json", "tsconfig.json"].map(
      async (filename) => await readFile(filename, "utf-8")
    )
  );
  const publicEnvironment = Object.fromEntries(
    inlinedVariables.map((key) => [key, process.env[key] ?? null])
  );
  const sha256 = createHash("sha256")
    .update(
      JSON.stringify({ directories, rootFiles, stage, publicEnvironment })
    )
    .digest("hex");
  await Promise.all(
    ["web", "admin"].map(async (app) => {
      await writeFile(
        `apps/${app}/${buildStampName}`,
        `${JSON.stringify({ sha256 })}\n`
      );
    })
  );
};
