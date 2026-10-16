import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");
const hooksRoot = join(repositoryRoot, "apps/web/src/hooks");
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredDirectories = new Set(["dist", "node_modules"]);

/** Hooks that only mutate or manage accounts; reads use Better Auth or non-PC APIs. */
const productClientRunAllowed = new Set([
  "apps/web/src/hooks/use-account-panel.ts",
  "apps/web/src/hooks/use-adjust-needed-positions.ts",
  "apps/web/src/hooks/use-chord-chart-song.ts",
  "apps/web/src/hooks/use-feedback-draft.ts",
  "apps/web/src/hooks/use-plan-tab-controller.ts",
  "apps/web/src/hooks/use-schedule-plan-person.ts",
  "apps/web/src/hooks/use-times-tab-controller.ts",
  "apps/web/src/hooks/use-unschedule-plan-person.ts",
  "apps/web/src/hooks/use-update-plan-person-status.ts",
]);

const walkFiles = (root: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (entry.name.startsWith(".") || ignoredDirectories.has(entry.name))
    ) {
      continue;
    }
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
      continue;
    }
    if (sourceExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
};

/** Product reads must route through callForQuery so priority and abort signals stay consistent. */
const directProductClientRun = (contents: string): string[] => {
  if (!contents.includes("productClient.run")) {
    return [];
  }
  const findings: string[] = [];
  for (const match of contents.matchAll(/productClient\.run/gu)) {
    const index = match.index ?? 0;
    const before = contents.slice(Math.max(0, index - 240), index);
    if (!before.includes("callForQuery(")) {
      const line = contents.slice(0, index).split("\n").length;
      findings.push(`productClient.run without callForQuery (line ${line})`);
    }
  }
  return findings;
};

describe("web product query calls", () => {
  it("routes TanStack query reads through callForQuery", () => {
    const violations: string[] = [];
    for (const path of walkFiles(hooksRoot)) {
      const relativePath = relative(repositoryRoot, path);
      if (productClientRunAllowed.has(relativePath)) {
        continue;
      }
      const contents = readFileSync(path, "utf8");
      for (const finding of directProductClientRun(contents)) {
        violations.push(`${relativePath}: ${finding}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
