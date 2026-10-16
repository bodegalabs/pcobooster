/**
 * Session replay must not record person-identifying text outside ReplayMask or blocked avatars.
 */
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");
const webComponentsRoot = join(repositoryRoot, "apps/web/src/components");
const sourceExtensions = new Set([".tsx"]);
const ignoredDirectories = new Set(["dist", "node_modules", "ui"]);

const personNamePattern = /\b(?:person\.(?:name|fullName)|fullName)\b/u;

const personNameInJsxText =
  />\s*\{[^}]*\b(?:person\.(?:name|fullName)|fullName)\b[^}]*\}\s*</gu;

const personNameInAttribute =
  /(?:aria-label|title)=\{[^}]*\b(?:person\.(?:name|fullName)|fullName)\b[^}]*\}/gu;

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

/** Avatar roots set data-replay-block in `avatar.tsx`; initials stay off replay pixels. */
const isInsideAvatar = (contents: string, matchIndex: number): boolean => {
  const before = contents.slice(0, matchIndex);
  const lastOpen = before.lastIndexOf("<Avatar");
  const lastClose = before.lastIndexOf("</Avatar>");
  return lastOpen !== -1 && lastOpen > lastClose;
};

const replayMaskViolations = (contents: string): string[] => {
  if (!personNamePattern.test(contents)) {
    return [];
  }
  const findings: string[] = [];
  for (const match of contents.matchAll(personNameInJsxText)) {
    const index = match.index ?? 0;
    if (
      !isInsideReplayMask(contents, index) &&
      !isInsideAvatar(contents, index)
    ) {
      const line = contents.slice(0, index).split("\n").length;
      findings.push(`unmasked person name in JSX text at line ${line}`);
    }
  }
  for (const match of contents.matchAll(personNameInAttribute)) {
    const index = match.index ?? 0;
    if (!isInsideReplayMask(contents, index)) {
      const line = contents.slice(0, index).split("\n").length;
      findings.push(
        `unmasked person name in aria-label or title at line ${line}`
      );
    }
  }
  return findings;
};

describe("replay mask coverage", () => {
  it("masks person-identifying strings in web components", () => {
    const violations: string[] = [];
    for (const path of walkFiles(webComponentsRoot)) {
      const contents = readFileSync(path, "utf8");
      for (const finding of replayMaskViolations(contents)) {
        violations.push(`${relative(repositoryRoot, path)}: ${finding}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
