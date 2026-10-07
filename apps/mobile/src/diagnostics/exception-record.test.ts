import { afterEach, describe, expect, it } from "vitest";

import { buildExceptionRecord } from "./exception-record";
import {
  MAX_FRAMES,
  sanitizeExceptionList,
  sanitizeFilename,
  sanitizeMessage,
} from "./sanitize";

const BUNDLE =
  "/private/var/containers/Bundle/Application/0F1E2D3C-AAAA-BBBB-CCCC-123456789ABC/PCOBooster.app/main.jsbundle";
const CHUNK_ID = "11111111-2222-3333-4444-555555555555";

/** A Release Hermes stack: bytecode offsets in the installed bundle. */
const hermesError = (message: string): Error => {
  const error = new Error(message);
  error.stack = [
    `Error: ${message}`,
    `    at renderPlan (address at ${BUNDLE}:1:123456)`,
    `    at ?anon_0_ (address at ${BUNDLE}:1:999)`,
    "    at loadModuleImplementation (address at InternalBytecode.js:1:5000)",
  ].join("\n");
  return error;
};

describe(buildExceptionRecord, () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "_posthogChunkIds");
  });

  it("parses Hermes frames with the Metro chunk ID and keeps only the bundle's file name", () => {
    Reflect.set(globalThis, "_posthogChunkIds", {
      [`Error\n    at anonymous (address at ${BUNDLE}:1:100)`]: CHUNK_ID,
    });
    const record = buildExceptionRecord(hermesError("boom"), "fatal");
    const [exception] = record.exceptions;
    expect([record.level, exception?.type]).toStrictEqual(["fatal", "Error"]);
    expect(exception?.mechanism).toStrictEqual({
      type: "onuncaughtexception",
      handled: false,
      synthetic: false,
      exception_id: 0,
    });
    expect(exception?.stacktrace?.frames).toStrictEqual([
      {
        platform: "hermes",
        filename: "InternalBytecode.js",
        function: "loadModuleImplementation",
        in_app: true,
        lineno: 1,
        colno: 5000,
      },
      {
        platform: "hermes",
        filename: "main.jsbundle",
        function: "?anon_0_",
        in_app: true,
        lineno: 1,
        colno: 999,
        chunk_id: CHUNK_ID,
      },
      {
        platform: "hermes",
        filename: "main.jsbundle",
        function: "renderPlan",
        in_app: true,
        lineno: 1,
        colno: 123_456,
        chunk_id: CHUNK_ID,
      },
    ]);
    expect(JSON.stringify(record)).not.toContain("0F1E2D3C");
    expect(record.fingerprint).toBe("Error|boom|main.jsbundle:1:123456");
  });

  it("scrubs the message and every chained cause", () => {
    const error = hermesError(
      "Failed for jane@example.com at https://pcobooster.com/plans/123456?x=1"
    );
    error.cause = new TypeError(
      'Expected string, actual {"name":"Jordan Hale","id":"98765"}'
    );
    const record = buildExceptionRecord(error, "handled");
    expect(record.exceptions.map((exception) => exception.value)).toStrictEqual(
      ["Failed for <email> at <url>", "Expected string, actual <value>"]
    );
    expect(record.exceptions[1]?.mechanism).toMatchObject({
      type: "chained",
      source: "cause",
      parent_id: 0,
    });
  });

  it("says only that a non-error value was thrown, never its keys or text", () => {
    const record = buildExceptionRecord(
      { personName: "Jordan Hale" },
      "unhandled-rejection"
    );
    expect(record.exceptions).toStrictEqual([
      {
        type: "Error",
        value: "A non-error value was thrown",
        mechanism: {
          type: "onunhandledrejection",
          handled: false,
          synthetic: true,
          exception_id: 0,
        },
      },
    ]);
  });
});

describe(sanitizeMessage, () => {
  it.each([
    [
      "Bearer eyJhbGciOiJIUzI1NiJ9.abc123def456ghi789",
      "An error contained authorization credentials",
    ],
    [
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyzABCDEF",
      "An error contained authorization credentials",
    ],
    [
      "authorization=Basic dXNlcjpwYXNz",
      "An error contained authorization credentials",
    ],
    ["bearer abc", "An error contained authorization credentials"],
    [
      `token=abc password: hunter "apiKey": "xyz" secret='s3'`,
      `token=<secret> password: <secret> "apiKey": <secret> secret=<secret>`,
    ],
    ["x-pcobooster-demo: demo", "An error contained authorization credentials"],
    [
      "Cookie: session=abc; theme=dark",
      "An error contained authorization credentials",
    ],
    [
      "callback access_token=short&state=1",
      "callback access_token=<secret>&state=1",
    ],
    ["opaque ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef here", "opaque <token> here"],
    ["The token expired", "The token expired"],
    ["plan 1234567 missing", "plan <n> missing"],
    ["id 3f2c9b1a-1111-2222-3333-444455556666", "id <id>"],
    ["read /Users/jordan/Library/file.json failed", "read <path> failed"],
    [
      "Cannot read property 'title' of undefined",
      "Cannot read property 'title' of undefined",
    ],
    ["word ".repeat(80), "word ".repeat(40)],
  ])("%s", (input, expected) => {
    expect(sanitizeMessage(input)).toBe(expected);
  });
});

describe(sanitizeFilename, () => {
  it("drops directories, queries, and fragments", () => {
    expect(
      sanitizeFilename(
        "http://192.168.1.5:8081/index.bundle?platform=ios&dev=true#x"
      )
    ).toBe("index.bundle");
  });
});

describe(sanitizeExceptionList, () => {
  it("rebuilds exceptions and frames from the allowlist, dropping source context, paths, modules, and variables", () => {
    const [exception] = sanitizeExceptionList([
      {
        type: "Error",
        value: "boom",
        mechanism: { type: "generic", handled: true, synthetic: false },
        module: "app",
        thread_id: 7,
        stacktrace: {
          type: "raw",
          frames: [
            {
              platform: "hermes",
              filename: "main.jsbundle",
              function: "render",
              lineno: 1,
              colno: 2,
              in_app: true,
              abs_path: "/private/var/containers/x/main.jsbundle",
              context_line: "const secret = 'x'",
              pre_context: ["a"],
              vars: { token: "t" },
              module: "app",
            },
          ],
        },
      },
    ]);
    expect(exception).toStrictEqual({
      type: "Error",
      value: "boom",
      mechanism: { type: "generic", handled: true, synthetic: false },
      stacktrace: {
        type: "raw",
        frames: [
          {
            platform: "hermes",
            filename: "main.jsbundle",
            function: "render",
            in_app: true,
            lineno: 1,
            colno: 2,
          },
        ],
      },
    });
  });

  it("keeps the innermost frames when a stack is too deep", () => {
    const frames = Array.from({ length: MAX_FRAMES + 10 }, (_, index) => ({
      platform: "hermes" as const,
      filename: "main.jsbundle",
      function: `f${index}`,
      lineno: 1,
      colno: index,
      in_app: true,
    }));
    const [exception] = sanitizeExceptionList([
      { type: "Error", value: "deep", stacktrace: { type: "raw", frames } },
    ]);
    expect(exception?.stacktrace?.frames).toHaveLength(MAX_FRAMES);
    expect(exception?.stacktrace?.frames.at(-1)?.function).toBe(
      `f${MAX_FRAMES + 9}`
    );
  });

  it("replaces an unusual type name with Error", () => {
    const [exception] = sanitizeExceptionList([
      { type: "Error for jane@example.com", value: "x" },
    ]);
    expect(exception?.type).toBe("Error");
  });
});
