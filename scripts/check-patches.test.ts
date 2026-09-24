import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * A stale Bun cache can leave a patched dependency unpatched while everything still builds.
 * Every installed copy must contain each line the patch adds.
 */
const rootDir = path.resolve(import.meta.dirname, "..");
const workspaceGroups = ["apps", "packages"];

const manifest = z
  .object({ patchedDependencies: z.record(z.string(), z.string()) })
  .parse(JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf-8")));

const addedLinesByFile = (patch: string): Map<string, string[]> => {
  const files = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice("+++ ".length).replace(/^b\//u, "");
      current = target.startsWith(".bun-tag-") ? undefined : [];
      if (current !== undefined) {
        files.set(target, current);
      }
    } else if (line.startsWith("+") && current !== undefined) {
      const added = line.slice(1).trim();
      if (added !== "") {
        current.push(added);
      }
    }
  }
  return files;
};

const installedCopies = (name: string): string[] => {
  const workspaces = workspaceGroups.flatMap((group) =>
    readdirSync(path.join(rootDir, group)).map((entry) =>
      path.join(rootDir, group, entry)
    )
  );
  const copies = [rootDir, ...workspaces]
    .map((directory) => path.join(directory, "node_modules", name))
    .filter((directory) => existsSync(directory))
    .map((directory) => realpathSync(directory));
  return [...new Set(copies)];
};

const packageName = (specifier: string): string =>
  specifier.slice(0, specifier.lastIndexOf("@"));

describe("patched dependencies", () => {
  it.each(Object.entries(manifest.patchedDependencies))(
    "%s is applied to every installed copy",
    (specifier, patchFile) => {
      const patch = readFileSync(path.join(rootDir, patchFile), "utf-8");
      const copies = installedCopies(packageName(specifier));
      expect(copies.length).toBeGreaterThan(0);
      for (const copy of copies) {
        for (const [file, added] of addedLinesByFile(patch)) {
          const installed = readFileSync(path.join(copy, file), "utf-8");
          const missing = added.filter((line) => !installed.includes(line));
          expect({ copy, file, missing }).toStrictEqual({
            copy,
            file,
            missing: [],
          });
        }
      }
    }
  );
});
