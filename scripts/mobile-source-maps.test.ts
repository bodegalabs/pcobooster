import { describe, expect, it } from "vitest";

import {
  bundleDebugId,
  entryOrderProblems,
  releaseMapProblems,
  summarizeSourceMap,
} from "../apps/mobile/scripts/source-maps";

const DEBUG_ID = "276fc392-115d-4d38-8b2d-efc090cf44ac";

interface MapFields {
  readonly sources?: readonly string[];
  readonly debugId?: string;
  readonly chunkId?: string;
  readonly x_hermes_function_offsets?: Readonly<
    Record<string, readonly number[]>
  >;
}

const map = (fields: MapFields) =>
  JSON.stringify({
    version: 3,
    sources: ["/apps/mobile/src/diagnostics/fatal-sentinel.ts"],
    mappings: "",
    ...fields,
  });

const packagerMap = map({ debugId: DEBUG_ID });
const composedMap = map({ x_hermes_function_offsets: { 0: [0] } });
const bytecode = new TextEncoder().encode(`\u0000hbc\u0000${DEBUG_ID}\u0000`);

describe(summarizeSourceMap, () => {
  it("reads Expo's debugId and PostHog's chunkId", () => {
    expect([
      summarizeSourceMap(packagerMap)?.debugId,
      summarizeSourceMap(map({ chunkId: DEBUG_ID }))?.debugId,
      summarizeSourceMap("not json"),
    ]).toStrictEqual([DEBUG_ID, DEBUG_ID, null]);
  });
});

describe(releaseMapProblems, () => {
  it("accepts maps that belong to the shipped bytecode", () => {
    expect(
      releaseMapProblems({ packagerMap, composedMap, bytecode, cloned: false })
    ).toStrictEqual([]);
  });

  it("rejects maps from another build", () => {
    expect(
      releaseMapProblems({
        packagerMap,
        composedMap,
        bytecode: new TextEncoder().encode("other build"),
        cloned: false,
      })
    ).toStrictEqual([
      `The shipped bundle does not contain debug ID ${DEBUG_ID}; the maps belong to another build.`,
    ]);
  });

  it("rejects a packager map without a debug ID", () => {
    expect(
      releaseMapProblems({
        packagerMap: map({}),
        composedMap,
        bytecode,
        cloned: false,
      })
    ).toStrictEqual([
      "The packager map has no debug ID; is metro.config.ts using getPostHogExpoConfig?",
    ]);
  });

  it("requires the composed map to carry the chunk ID once posthog-cli cloned it", () => {
    expect([
      releaseMapProblems({ packagerMap, composedMap, bytecode, cloned: true }),
      releaseMapProblems({
        packagerMap,
        composedMap: map({
          chunkId: DEBUG_ID,
          x_hermes_function_offsets: { 0: [0] },
        }),
        bytecode,
        cloned: true,
      }),
    ]).toStrictEqual([
      [
        "The composed map's chunk ID does not match the packager map's debug ID.",
      ],
      [],
    ]);
  });

  it("rejects a composed map that is not Hermes's or names no app sources", () => {
    expect(
      releaseMapProblems({
        packagerMap,
        composedMap: map({ sources: ["/node_modules/x.js"] }),
        bytecode,
        cloned: false,
      })
    ).toHaveLength(2);
  });
});

describe(bundleDebugId, () => {
  it("reads the trailer Expo writes", () => {
    expect(
      bundleDebugId(
        `__r(0);\n//# sourceMappingURL=main.jsbundle.map\n//# debugId=${DEBUG_ID}\n`
      )
    ).toBe(DEBUG_ID);
  });
});

/** A miniature Metro bundle: module 0 is the entry, importing `order` in sequence. */
type ModuleName = "sentinel" | "polyfill" | "diagnostics" | "router";

const bundle = (order: readonly ModuleName[]) => {
  const bodies = {
    sentinel: 'Object.defineProperty(exports, "installFatalSentinel", {});',
    polyfill: "Array.prototype.toSorted = 1;",
    diagnostics: 'const file = "pcobooster-pending-fatals.json";',
    router: "registerRootComponent();",
  };
  const modules = order.map(
    (name, index) =>
      `__d(function (global, require) {\n${bodies[name]}\n},${index + 1},[]);`
  );
  const entry = `__d(function (global, require) {\nrequire(0);\n},0,[${order.map((_, index) => index + 1).join(",")}]);`;
  return [
    entry,
    ...modules,
    "__r(460);",
    "__r(0);",
    "//# sourceMappingURL=main.jsbundle.map",
  ].join("\n");
};

describe(entryOrderProblems, () => {
  it("accepts the sentinel first and diagnostics before the router", () => {
    expect(
      entryOrderProblems(
        bundle(["sentinel", "polyfill", "diagnostics", "router"])
      )
    ).toStrictEqual([]);
  });

  it("rejects anything evaluated before the sentinel, or the router before diagnostics", () => {
    expect(
      entryOrderProblems(
        bundle(["polyfill", "sentinel", "router", "diagnostics"])
      )
    ).toStrictEqual([
      "The fatal sentinel is not the entry module's first import.",
      "Diagnostics is not imported before the router entry.",
    ]);
  });
});
