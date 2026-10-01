import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { Data, Effect } from "effect";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { build } from "tsdown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cachedAcrossRequests } from "./shared-initialization";

const CONCURRENT_REQUESTS = 6;
const REQUEST_TIMEOUT_MS = 5000;
const WORKERD_TEST_TIMEOUT_MS = 30_000;

let outDir = "";
let script = "";

/** Starts concurrent requests on a cold isolate; each reads its own body after the shared wait. */
const coldStartBodies = async (share: string): Promise<string[]> => {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-09-01",
      script,
    })
  );
  try {
    return await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, async (_, index) => {
        const response = worker
          .dispatchFetch(
            `http://localhost/api/rpc/catalog/plans?share=${share}`,
            {
              method: "POST",
              body: `body-${index}`,
            }
          )
          .then(async (result) =>
            result.ok ? await result.text() : `failed ${result.status}`
          );
        return await Promise.race([
          response,
          delay(REQUEST_TIMEOUT_MS, "timed out"),
        ]);
      })
    );
  } finally {
    await worker.dispose();
  }
};

class BuildFailed extends Data.TaggedError("BuildFailed")<{
  readonly attempt: number;
}> {}

describe(cachedAcrossRequests, () => {
  beforeAll(async () => {
    outDir = await mkdtemp(path.join(tmpdir(), "shared-initialization-"));
    await build({
      config: false,
      entry: {
        worker: path.join(
          import.meta.dirname,
          "shared-initialization.fixture.ts"
        ),
      },
      outDir,
      format: "esm",
      platform: "browser",
      deps: { alwaysBundle: [/.*/u] },
      dts: false,
      logLevel: "silent",
    });
    const [bundle] = await readdir(outDir);
    script = await readFile(path.join(outDir, bundle ?? ""), "utf-8");
  }, WORKERD_TEST_TIMEOUT_MS);

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it(
    "lets every request that waited on a cold start read its own body in workerd",
    async () => {
      await expect(coldStartBodies("across-requests")).resolves.toStrictEqual(
        Array.from(
          { length: CONCURRENT_REQUESTS },
          (_, index) => `body-${index}`
        )
      );
    },
    WORKERD_TEST_TIMEOUT_MS
  );

  it(
    "fails the same cold start with Effect.cached, as production did",
    async () => {
      // The production symptom: "Cannot perform I/O on behalf of a different request".
      await expect(coldStartBodies("cached")).resolves.toStrictEqual([
        "body-0",
        ...Array.from({ length: CONCURRENT_REQUESTS - 1 }, () => "failed 500"),
      ]);
    },
    WORKERD_TEST_TIMEOUT_MS
  );

  it("runs once for concurrent callers", async () => {
    let runs = 0;
    const result = await Effect.runPromise(
      Effect.gen(function* concurrentCallers() {
        const app = yield* cachedAcrossRequests(
          Effect.sync(() => {
            runs += 1;
            return "app";
          }).pipe(Effect.delay("10 millis"))
        );
        const concurrent = yield* Effect.all([app, app, app], {
          concurrency: "unbounded",
        });
        return [...concurrent, yield* app];
      })
    );
    expect(result).toStrictEqual(["app", "app", "app", "app"]);
    expect(runs).toBe(1);
  });

  it("keeps a typed failure typed, then retries instead of caching it", async () => {
    let attempts = 0;
    const [failure, retried] = await Effect.runPromise(
      Effect.gen(function* failThenRetry() {
        const app = yield* cachedAcrossRequests(
          Effect.suspend(() => {
            attempts += 1;
            return attempts === 1
              ? Effect.fail(new BuildFailed({ attempt: attempts }))
              : Effect.succeed("app");
          })
        );
        return [yield* Effect.flip(app), yield* app] as const;
      })
    );
    expect(failure).toStrictEqual(new BuildFailed({ attempt: 1 }));
    expect(retried).toBe("app");
    expect(attempts).toBe(2);
  });
});
