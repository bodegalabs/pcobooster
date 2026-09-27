import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");
const ignoredDirectories = new Set(["dist", "node_modules"]);

/**
 * Stylesheet roots. `local/no-backdrop-blur` covers Tailwind classes; this
 * covers hand-written CSS, where frosted backgrounds use `backdrop-filter`.
 */
const checkedParents = ["apps", "packages"];

/** `backdrop-filter`, `-webkit-backdrop-filter`, and Tailwind's `--tw-backdrop-*`. */
const backdropFilterPattern = /backdrop-filter|--tw-backdrop-/gu;

const lineOf = (contents: string, index: number): number =>
  contents.slice(0, index).split("\n").length;

const backdropFilterLines = (contents: string): number[] =>
  [...contents.matchAll(backdropFilterPattern)].map((match) =>
    lineOf(contents, match.index)
  );

const walkCssFiles = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || ignoredDirectories.has(entry.name)) {
      return [];
    }
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return walkCssFiles(path);
    }
    return extname(entry.name) === ".css" ? [path] : [];
  });

/** Each workspace's `src` directory, where its source stylesheets live. */
const sourceRoots = (): string[] =>
  checkedParents.flatMap((parent) =>
    readdirSync(join(repositoryRoot, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(repositoryRoot, parent, entry.name, "src"))
      .filter((path) => existsSync(path))
  );

describe("backdrop-filter in CSS", () => {
  it("finds backdrop filters", () => {
    expect(
      backdropFilterLines(
        [
          ".menu {",
          "  background: var(--background);",
          "  backdrop-filter: blur(16px);",
          "  -webkit-backdrop-filter: blur(16px);",
          "}",
        ].join("\n")
      )
    ).toStrictEqual([3, 4]);
  });

  it("keeps stylesheet backgrounds solid", () => {
    const violations: string[] = [];
    for (const root of sourceRoots()) {
      for (const path of walkCssFiles(root)) {
        for (const line of backdropFilterLines(readFileSync(path, "utf8"))) {
          violations.push(
            `${relative(repositoryRoot, path)} line ${line}: avoid blurred/frosted backgrounds; use a solid background such as var(--background)`
          );
        }
      }
    }
    expect(violations).toStrictEqual([]);
  });
});
