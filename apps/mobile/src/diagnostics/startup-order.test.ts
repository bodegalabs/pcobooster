import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const mobile = path.join(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(mobile, file), "utf-8");
const IMPORT = /^import\s+(?:[^"']+from\s+)?["'](?<specifier>[^"']+)["'];?$/gmu;
const importsOf = (source: string) =>
  [...source.matchAll(IMPORT)].map((match) => match.groups?.specifier);

describe("app entry order", () => {
  it("installs the sentinel first, the polyfills next, diagnostics before the router", () => {
    expect(importsOf(read("index.ts"))).toStrictEqual([
      "./src/diagnostics/fatal-sentinel",
      "core-js/actual/array/to-reversed",
      "core-js/actual/array/to-sorted",
      "core-js/actual/array/to-spliced",
      "core-js/actual/array/with",
      "./src/diagnostics/device-diagnostics",
      "expo-router/entry",
    ]);
  });

  it("keeps the sentinel free of imports, so nothing can fail before it is installed", () => {
    expect(importsOf(read("src/diagnostics/fatal-sentinel.ts"))).toStrictEqual(
      []
    );
  });

  it("keeps the startup diagnostics path off the router, the contracts, and the product client", () => {
    const startupModules = [
      "src/diagnostics/device-diagnostics.ts",
      "src/diagnostics/diagnostics-client.ts",
      "src/diagnostics/exception-record.ts",
      "src/diagnostics/pending-fatals.ts",
      "src/diagnostics/release-metadata.ts",
      "src/diagnostics/sanitize.ts",
      "src/diagnostics/capture-policy.ts",
    ];
    const allowed = new Set([
      "@posthog/core/error-tracking",
      "@posthog/core/vendor/uuidv7",
      "effect",
      "expo-application",
      "expo-file-system",
      "react-native",
    ]);
    for (const file of startupModules) {
      for (const specifier of importsOf(read(file))) {
        expect(
          specifier?.startsWith("./") === true || allowed.has(specifier ?? ""),
          `${file} imports ${specifier}`
        ).toBeTruthy();
      }
    }
  });
});
