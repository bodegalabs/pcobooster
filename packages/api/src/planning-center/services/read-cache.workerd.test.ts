/**
 * The read cache inside workerd, which ties I/O to the request that started it. Unit tests run
 * in Node, where a promise from one request settles for every other; here a load that another
 * request started never settles once that request ends. The fixture Worker keeps one cache per
 * isolate, as `createServerDependencies` does, and reads through the KV shared tier and a slow
 * stand-in for Planning Center that the test releases.
 */
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

import { Miniflare, Response as MiniflareResponse } from "miniflare";
import { afterEach, describe, expect, it } from "vitest";

/** How long the fixture waits on the cache before it reports a hung read. */
const HUNG_AFTER_MS = 2000;
/** When the first request gives up on its own read, while the second still waits. */
const FIRST_REQUEST_ABORTS_AFTER_MS = 150;

const fixtureWorker = `
import { PlanningCenterReadCache } from "./read-cache.js";
import { createSharedReadKeys, createSharedReadTier } from "./shared-read-store.js";

const isolateCache = new PlanningCenterReadCache();
let tier;

export default {
  async fetch(request, env) {
    tier ??= createSharedReadTier(env.CACHE, () => {});
    const session = tier.session();
    const cache = isolateCache.forRequest().withSharedTier({
      session,
      keys: createSharedReadKeys("scope", "fixture"),
      codec: { encode: (value) => value, decode: (stored) => stored },
    });
    const abortAfter = Number(new URL(request.url).searchParams.get("abortAfter"));
    const controller = new AbortController();
    if (abortAfter > 0) {
      setTimeout(() => controller.abort(), abortAfter);
    }
    const hung = new Promise((resolve) => {
      setTimeout(() => resolve("hung"), ${HUNG_AFTER_MS});
    });
    try {
      const read = cache.get(
        "scope:key",
        60000,
        async (signal) => {
          const response = await env.PLANNING_CENTER.fetch("http://planning-center/", { signal });
          return await response.text();
        },
        controller.signal
      );
      return new Response(await Promise.race([read, hung]));
    } catch (error) {
      return new Response(error.name, { status: 499 });
    } finally {
      await session.settle();
    }
  },
};
`;

const moduleSource = async (name: string) =>
  stripTypeScriptTypes(
    await readFile(new URL(`${name}.ts`, import.meta.url), "utf-8")
  );

const fixture = async () => {
  const planningCenter = {
    calls: 0,
    release: Promise.withResolvers<true>(),
  };
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: "read-cache-fixture",
          compatibilityDate: "2026-09-01",
          compatibilityFlags: ["nodejs_compat"],
          manifest: {
            mainModule: "index.js",
            modulesRoot: "/",
            modules: {
              "index.js": { type: "esm", contents: fixtureWorker },
              "read-cache.js": {
                type: "esm",
                contents: await moduleSource("read-cache"),
              },
              "shared-read-store.js": {
                type: "esm",
                contents: await moduleSource("shared-read-store"),
              },
            },
          },
          env: {
            CACHE: { type: "kv", id: "read-cache-fixture" },
            PLANNING_CENTER: {
              type: "fetcher",
              handler: async () => {
                planningCenter.calls += 1;
                const call = planningCenter.calls;
                await planningCenter.release.promise;
                return new MiniflareResponse(`loaded by call ${call}`);
              },
            },
          },
        },
      },
    ],
  });
  await runtime.ready;
  return { runtime, planningCenter };
};

const callsReach = async (
  planningCenter: { readonly calls: number },
  count: number
) => {
  await expect
    .poll(() => planningCenter.calls, { timeout: HUNG_AFTER_MS })
    .toBeGreaterThanOrEqual(count);
};

describe("planning center read cache in workerd", () => {
  let runtime: Miniflare | undefined;

  afterEach(async () => {
    await runtime?.dispose();
    runtime = undefined;
  });

  it("still answers a request whose key another request started loading and abandoned", async () => {
    const started = await fixture();
    ({ runtime } = started);
    const { planningCenter } = started;

    const first = runtime.dispatchFetch(
      `http://fixture/?abortAfter=${FIRST_REQUEST_ABORTS_AFTER_MS}`
    );
    await callsReach(planningCenter, 1);
    const second = runtime.dispatchFetch("http://fixture/");
    const firstResponse = await first;
    planningCenter.release.resolve(true);
    const secondResponse = await second;

    expect(firstResponse.status).toBe(499);
    await expect(firstResponse.text()).resolves.toBe("AbortError");
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.text()).resolves.toMatch(/^loaded by call/u);
  }, 20_000);

  it("serves a loaded value to later requests without loading again", async () => {
    const started = await fixture();
    ({ runtime } = started);
    const { planningCenter } = started;
    planningCenter.release.resolve(true);

    const first = await runtime.dispatchFetch("http://fixture/");
    const second = await runtime.dispatchFetch("http://fixture/");

    await expect(first.text()).resolves.toBe("loaded by call 1");
    await expect(second.text()).resolves.toBe("loaded by call 1");
    expect(planningCenter.calls).toBe(1);
  }, 20_000);
});
