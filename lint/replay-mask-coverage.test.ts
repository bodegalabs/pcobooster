/**
 * Prototype (spike): flag visible person-name JSX that is not wrapped in ReplayMask.
 * Branch cursor/spike-replay-mask-lint-9182 — not merged; informs docs/agent-friendly-plan.md.
 */
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");
const webComponentsRoot = join(repositoryRoot, "apps/web/src/components");
const sourceExtensions = new Set([".tsx"]);
const ignoredDirectories = new Set(["dist", "node_modules", "ui"]);

const personNameInJsxPattern =
  />\s*\{[^}]*\b(?:person\.(?:name|fullName)|fullName)\b[^}]*\}\s*</gu;

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

const isInsideReplayMask = (contents: string, matchIndex: number): boolean => {
  const before = contents.slice(0, matchIndex);
  const lastOpen = before.lastIndexOf("<ReplayMask");
  const lastClose = before.lastIndexOf("</ReplayMask>");
  return lastOpen !== -1 && lastOpen > lastClose;
};

describe("replay mask coverage spike", () => {
  it("lists person-name JSX not wrapped in ReplayMask", () => {
    const findings: string[] = [];
    for (const path of walkFiles(webComponentsRoot)) {
      const contents = readFileSync(path, "utf8");
      if (!contents.includes("ReplayMask") && !personNameInJsxPattern.test(contents)) {
        continue;
      }
      personNameInJsxPattern.lastIndex = 0;
      for (const match of contents.matchAll(personNameInJsxPattern)) {
        const index = match.index ?? 0;
        if (!isInsideReplayMask(contents, index)) {
          const line = contents.slice(0, index).split("\n").length;
          findings.push(`${relative(repositoryRoot, path)}:${line}`);
        }
      }
    }
    // Spike: report only; tighten to expect([]) when promoting to CI.
    expect(findings.length).toBeLessThan(50);
    if (findings.length > 0) {
      // eslint-disable-next-line no-console -- spike survey output
      console.info("unmasked person-name JSX:\n", findings.join("\n"));
    }
  });
});
