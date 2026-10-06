import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");

/** Source the browser bundles: the product, and every package it imports. */
const browserSources = [
  "apps/web/src",
  "packages/client/src",
  "packages/contracts/src",
  "packages/planning-center-models/src",
  "packages/ui/src",
];

const sourceExtensions = new Set([".ts", ".tsx"]);

const walkFiles = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(path);
    }
    const isTest = /\.test\.tsx?$/u.test(entry.name);
    return sourceExtensions.has(extname(entry.name)) && !isTest ? [path] : [];
  });

const effectImport =
  /import\s+(?:\*\s+as\s+(?<namespace>\w+)|\{(?<names>[^}]*)\})\s+from\s+"effect(?:\/[^"]*)?"/gu;
const destructure = /\bconst\s*\{[^}]*\}\s*=\s*(?<source>\w+)\s*;/gu;

/** Names a file imports from Effect (`Schema`, `Effect`, `* as RpcClient`). */
const effectNames = (text: string): Set<string> => {
  const names = new Set<string>();
  for (const match of text.matchAll(effectImport)) {
    const { namespace, names: list } = match.groups ?? {};
    if (namespace !== undefined) {
      names.add(namespace);
    }
    for (const name of list?.split(",") ?? []) {
      const local = name
        .trim()
        .split(/\s+as\s+/u)
        .at(-1)
        ?.trim();
      if (local !== undefined && local !== "" && !local.startsWith("type ")) {
        names.add(local);
      }
    }
  }
  return names;
};

describe("Effect namespaces in browser code", () => {
  it("are never destructured, which makes bundlers keep every export", () => {
    const offenders = browserSources
      .flatMap((source) => walkFiles(join(repositoryRoot, source)))
      .flatMap((path) => {
        const text = readFileSync(path, "utf8");
        const names = effectNames(text);
        return [...text.matchAll(destructure)]
          .filter((match) => names.has(match.groups?.source ?? ""))
          .map(
            (match) => `${relative(repositoryRoot, path)}: ${match[0].trim()}`
          );
      });

    expect(offenders).toStrictEqual([]);
  });
});
