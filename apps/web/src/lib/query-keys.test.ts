import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.join(import.meta.dirname, "..");
const SOURCE_FILE = /\.(?:ts|tsx)$/u;
const TEST_FILE = /\.test\.(?:ts|tsx)$/u;
/** A query key family written out by hand: `queryKey[0] === "x"` or `queryKey: ["x"`. */
const LITERAL_FAMILY =
  /queryKey\[0\] === "(?<compared>[^"]+)"|queryKey: \["(?<listed>[^"]+)"|QUERY_KEY = \["(?<constant>[^"]+)"/gu;

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(entryPath);
    }
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)
      ? [entryPath]
      : [];
  });

/** Every family `queryKeys` builds: the first element of each key it returns. */
const KEY_FAMILY = /\[\s*"(?<family>[^"]+)"/gu;
const knownFamilies = (): Set<string> =>
  new Set(
    [
      ...readFileSync(
        path.join(SOURCE_ROOT, "lib", "query-keys.ts"),
        "utf-8"
      ).matchAll(KEY_FAMILY),
    ].map(({ groups }) => groups?.family ?? "")
  );

describe("query key families", () => {
  it("names only families that queries still use", () => {
    const known = knownFamilies();
    const unknown = sourceFiles(SOURCE_ROOT).flatMap((file) =>
      [...readFileSync(file, "utf-8").matchAll(LITERAL_FAMILY)].flatMap(
        ({ groups }) => {
          const family =
            groups?.compared ?? groups?.listed ?? groups?.constant ?? "";
          return known.has(family) ? [] : [`${file}: ${family}`];
        }
      )
    );

    expect(unknown).toStrictEqual([]);
  });
});
