import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const ignoredDirectories = new Set([
  "node_modules",
  ".next",
  ".open-next",
  ".tanstack",
  ".turbo",
  "dist",
]);
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
 * base path) and public build variables, plus the workspaces Next.js memoization misses.
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
    Object.entries(process.env)
      .filter(
        ([key]) =>
          key.startsWith("NEXT_PUBLIC_") || key === "PEOPLE_PAGE_ENABLED"
      )
      .toSorted(([a], [b]) => a.localeCompare(b))
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

  // Alchemy accepts plain SQL but rejects Drizzle 0.x's journal layout.
  // The SQL files stay canonical in packages/api/migrations; this is a build output.
  const source = "packages/api/migrations";
  const destination = ".alchemy/d1-migrations";
  await mkdir(destination, { recursive: true });
  const sourceFiles = await readdir(source);
  const files = sourceFiles.filter((name) => name.endsWith(".sql"));
  const existingFiles = await readdir(destination);
  await Promise.all(
    existingFiles
      .filter((file) => !files.includes(file))
      .map(async (file) => {
        await rm(path.join(destination, file));
      })
  );
  await Promise.all(
    files.map(async (file) => {
      await copyFile(path.join(source, file), path.join(destination, file));
    })
  );
};
