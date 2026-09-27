import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");
const productSource = "apps/web/src";

/** The only module that sets the product page width (`PageShell`, `pageColumnClassName`). */
const pageShellPath = "apps/web/src/components/page-shell.tsx";

/** Centered columns narrower than the page on purpose, and why. */
const columnExceptions = new Map([
  [
    "apps/web/src/components/schedule/times-tab.tsx",
    "the plan's Times tab is a short form inside the plan workspace, not a page",
  ],
]);

const classStringPattern = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/gu;
const containerWidthPattern = /\bmax-w-(?:[2-7]xl|screen-\w+)\b/u;

const lineOf = (contents: string, index: number): number =>
  contents.slice(0, index).split("\n").length;

/** Class strings that center a column at their own container width. */
const centeredColumnWidths = (contents: string): string[] => {
  const findings: string[] = [];
  for (const match of contents.matchAll(classStringPattern)) {
    const width = containerWidthPattern.exec(match[0]);
    if (width && /\bmx-auto\b/u.test(match[0])) {
      findings.push(`line ${lineOf(contents, match.index)}: ${width[0]}`);
    }
  }
  return findings;
};

const walkFiles = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(path);
    }
    return extname(entry.name) === ".tsx" && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });

describe("page width", () => {
  it("finds centered columns with their own width", () => {
    expect(
      centeredColumnWidths(
        [
          '<div className="mx-auto flex w-full max-w-3xl flex-col">',
          '<p className="text-sm max-w-md">',
          '<div className="mx-auto max-w-full">',
        ].join("\n")
      )
    ).toStrictEqual(["line 1: max-w-3xl"]);
  });

  it("lays out every page in the shared page shell", () => {
    const violations: string[] = [];
    const matchedExceptions = new Set<string>();

    for (const path of walkFiles(join(repositoryRoot, productSource))) {
      const relativePath = relative(repositoryRoot, path);
      if (relativePath === pageShellPath) {
        continue;
      }
      const findings = centeredColumnWidths(readFileSync(path, "utf8"));
      if (findings.length === 0) {
        continue;
      }
      if (columnExceptions.has(relativePath)) {
        matchedExceptions.add(relativePath);
        continue;
      }
      for (const finding of findings) {
        violations.push(
          `${relativePath} ${finding}; wrap the page in PageShell or use pageColumnClassName from ${pageShellPath}`
        );
      }
    }

    for (const exception of columnExceptions.keys()) {
      if (!matchedExceptions.has(exception)) {
        violations.push(
          `${exception} no longer centers its own column; remove its exception`
        );
      }
    }

    expect(violations).toStrictEqual([]);
  });
});
