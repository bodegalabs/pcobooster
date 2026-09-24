import { createHash } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import {
  PlanningCenterCoreClient,
  createBasicPlanningCenterClient,
} from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { httpClientFor } from "@pcobooster/api/testing/http-client";
import { testPlanningCenterToken } from "@pcobooster/api/testing/server";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import { Cause, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";

type FetchMock = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

const jsonResponse = (body: JsonValue, init?: ResponseInit): Response =>
  Response.json(body, init);
const person = { id: "1", type: "Person", attributes: { name: "Alex" } };

const fetchMock = (): FetchMock => vi.fn<typeof globalThis.fetch>();

const basicClient = (fetch: FetchMock): PlanningCenterCoreClient =>
  createBasicPlanningCenterClient(
    testPlanningCenterToken,
    httpClientFor(fetch)
  );

const basicCacheScope = (secret: string): string =>
  new PlanningCenterCoreClient(
    { kind: "basic", applicationId: "client", secret },
    { httpClient: httpClientFor(fetchMock()) }
  ).getCacheScope();

const run = async <Value>(
  effect: Effect.Effect<Value, PlanningCenterError>
): Promise<Value> => await Effect.runPromise(effect);

const failureOf = async <Value>(
  effect: Effect.Effect<Value, PlanningCenterError>
): Promise<PlanningCenterError | undefined> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    return undefined;
  }
  return exit.cause.reasons.find(Cause.isFailReason)?.error;
};

const urlOf = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : input.toString();

const isInterrupted = <Value, Failure>(
  exit: Exit.Exit<Value, Failure>
): boolean => Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause);

const requestHeaders = (fetch: FetchMock, call = 0): Headers =>
  new Headers(fetch.mock.calls[call]?.[1]?.headers);

/** Resolves once the request is aborted, like `fetch` does. */
const hangUntilAborted: typeof globalThis.fetch = async (_input, init) => {
  const signal = init?.signal;
  if (signal) {
    await once(signal, "abort");
  }
  throw new DOMException("The operation was aborted", "AbortError");
};

/** Lets mocked fetch promises and body reads settle before the test clock moves. */
const settle = Effect.promise(async () => {
  await delay(20);
});

describe(PlanningCenterCoreClient, () => {
  it("binds bearer requests and cache scope to the constructor credential", async () => {
    const fetch = fetchMock().mockResolvedValue(jsonResponse({ data: person }));
    const client = new PlanningCenterCoreClient(
      { kind: "bearer", accessToken: "selected-account-token" },
      { httpClient: httpClientFor(fetch) }
    );
    await run(client.fetch("/services/v2/people/1"));
    const headers = requestHeaders(fetch);
    expect(headers.get("Authorization")).toBe("Bearer selected-account-token");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.has("traceparent")).toBeFalsy();
    expect(client.getCacheScope()).toBe(
      `bearer:${createHash("sha256").update("selected-account-token").digest("hex")}`
    );
  });

  it.each(["", "   "])("rejects empty bearer credential %j", (accessToken) => {
    expect(
      () =>
        new PlanningCenterCoreClient(
          { kind: "bearer", accessToken },
          { httpClient: httpClientFor(fetchMock()) }
        )
    ).toThrow("requires a non-empty access token");
  });

  it("uses application credentials only with the explicit Basic factory", async () => {
    const fetch = fetchMock().mockResolvedValue(jsonResponse({ data: person }));
    const client = createBasicPlanningCenterClient(
      { applicationId: "client", secret: "pat" },
      httpClientFor(fetch)
    );
    await run(client.fetch("/services/v2/people/1"));
    expect(requestHeaders(fetch).get("Authorization")).toBe(
      `Basic ${Buffer.from("client:pat").toString("base64")}`
    );
    expect(client.getCacheScope()).toBe(
      `basic:${createHash("sha256").update("client:pat").digest("hex")}`
    );
  });

  it("isolates cache scopes between personal access tokens", () => {
    expect(basicCacheScope("demo-pat")).not.toBe(basicCacheScope("pat"));
  });

  it("sends a JSON body with a write", async () => {
    const fetch = fetchMock().mockResolvedValue(jsonResponse({ data: person }));
    await run(
      basicClient(fetch).fetch("/services/v2/people", {
        method: "POST",
        body: { data: { type: "Person" } },
      })
    );
    const init = fetch.mock.calls[0]?.[1];
    const body = init?.body;
    expect(init?.method).toBe("POST");
    expect(
      body instanceof Uint8Array ? new TextDecoder().decode(body) : body
    ).toBe(JSON.stringify({ data: { type: "Person" } }));
    expect(requestHeaders(fetch).get("Content-Type")).toBe("application/json");
  });

  it("rejects writes from a read-only client before they reach Planning Center", async () => {
    const fetch = fetchMock().mockResolvedValue(jsonResponse({ data: person }));
    const client = new PlanningCenterCoreClient(
      { kind: "basic", applicationId: "demo", secret: "demo-pat" },
      { httpClient: httpClientFor(fetch), readOnly: true }
    );

    await expect(
      failureOf(
        client.fetch("/services/v2/people/1", { method: "PATCH", body: {} })
      )
    ).resolves.toMatchObject({
      _tag: "PlanningCenterReadOnlyError",
      method: "PATCH",
      path: "/services/v2/people/1",
    });
    await expect(
      failureOf(
        client.request("/services/v2/plan_times/1", { method: "DELETE" })
      )
    ).resolves.toMatchObject({ _tag: "PlanningCenterReadOnlyError" });
    expect(fetch).not.toHaveBeenCalled();

    await expect(
      run(client.fetch("/services/v2/people/1"))
    ).resolves.toMatchObject({ data: person });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("accepts empty writes through the transport method", async () => {
    const fetch = fetchMock().mockResolvedValue(
      new Response(null, { status: 204 })
    );
    const response = await run(
      basicClient(fetch).request("/services/v2/plan_times/1", {
        method: "DELETE",
      })
    );
    expect(response.status).toBe(204);
  });

  it("rejects an empty response where a JSON resource is required", async () => {
    const fetch = fetchMock().mockResolvedValue(
      new Response(null, { status: 204 })
    );
    await expect(
      failureOf(basicClient(fetch).fetch("/services/v2/people/1"))
    ).resolves.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([200, 503])(
    "classifies a failed %i response body stream as a provider network failure",
    async (status) => {
      const fetch = fetchMock().mockImplementation(
        async () =>
          await Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.error(new TypeError("body stream failed"));
                },
              }),
              { status }
            )
          )
      );

      await expect(
        failureOf(basicClient(fetch).fetch("/services/v2/people/1"))
      ).resolves.toMatchObject({
        _tag: "PlanningCenterNetworkError",
        cause: { message: "body stream failed" },
      });
      expect(fetch).toHaveBeenCalledOnce();
    }
  );

  it("rejects malformed resource identifiers before they enter service code", async () => {
    const fetch = fetchMock().mockResolvedValue(
      jsonResponse({ data: { id: 1, type: "Person" } })
    );
    await expect(
      failureOf(basicClient(fetch).fetch("/services/v2/people/1"))
    ).resolves.toMatchObject({
      _tag: "PlanningCenterApiError",
      code: "INVALID_RESPONSE",
    });
  });

  it("normalizes a singleton collection and preserves null relationships", async () => {
    const fetch = fetchMock().mockResolvedValue(
      jsonResponse({
        data: { ...person, relationships: { team: { data: null } } },
        links: { next: null },
      })
    );
    const response = await run(
      basicClient(fetch).fetchCollection("/services/v2/people")
    );
    expect(response.data).toStrictEqual([
      { ...person, relationships: { team: { data: null } } },
    ]);
    expect(response.links?.next).toBeUndefined();
  });

  it("accepts an absent relationship URL in schedule collections", async () => {
    const fetch = fetchMock().mockResolvedValue(
      jsonResponse({
        data: [
          {
            type: "Schedule",
            id: "schedule-1",
            relationships: { plan_times: { links: { related: null } } },
          },
        ],
      })
    );
    const response = await run(
      basicClient(fetch).fetchCollection("/services/v2/people/me/schedules")
    );
    expect(response.data).toStrictEqual([
      {
        type: "Schedule",
        id: "schedule-1",
        attributes: {},
        relationships: { plan_times: { links: { related: undefined } } },
      },
    ]);
  });

  it("follows pagination once per URL and deduplicates included resources", async () => {
    const firstUrl =
      "https://api.planningcenteronline.com/services/v2/people?per_page=100";
    const secondUrl =
      "https://api.planningcenteronline.com/services/v2/people?offset=100";
    const team = { type: "Team", id: "team-1", attributes: { name: "Band" } };
    const fetch = fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [person],
          included: [team],
          links: { next: secondUrl },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ...person, id: "2" }],
          included: [team],
          links: { next: firstUrl },
        })
      );
    const response = await run(
      basicClient(fetch).fetchAllWithIncluded("/services/v2/people")
    );
    expect(response.data.map((item) => item.id)).toStrictEqual(["1", "2"]);
    expect(response.included).toStrictEqual([team]);
    expect(fetch.mock.calls.map(([input]) => urlOf(input))).toStrictEqual([
      firstUrl,
      secondUrl,
    ]);
  });

  it("stops pagination and aborts the in-flight page when interrupted", async () => {
    const controller = new AbortController();
    const nextUrl =
      "https://api.planningcenteronline.com/services/v2/people?offset=100";
    const fetch = fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ data: [person], links: { next: nextUrl } })
      )
      .mockImplementationOnce(async (input, init) => {
        controller.abort();
        return await hangUntilAborted(input, init);
      });

    const exit = await Effect.runPromiseExit(
      basicClient(fetch).fetchAllWithIncluded("/services/v2/people"),
      { signal: controller.signal }
    );
    expect(isInterrupted(exit)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1]?.signal?.aborted).toBeTruthy();
  });

  it("retries a transient GET failure after a backoff", async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ error: "Temporarily unavailable" }, { status: 503 })
      )
      .mockResolvedValueOnce(jsonResponse({ data: person }));
    const result = await Effect.runPromise(
      Effect.gen(function* retryAfterBackoff() {
        const fiber = yield* Effect.forkChild(
          basicClient(fetch).fetch("/services/v2/people/1")
        );
        yield* settle;
        yield* TestClock.adjust("499 millis");
        expect(fetch).toHaveBeenCalledOnce();
        yield* TestClock.adjust("1 millis");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestClock.layer()))
    );
    expect(result.data.id).toBe("1");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("waits for Retry-After before retrying a rate-limited read", async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: "Rate limited" },
          { status: 429, headers: { "retry-after": "2" } }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ data: person }));
    await Effect.runPromise(
      Effect.gen(function* retryAfterRateLimit() {
        const fiber = yield* Effect.forkChild(
          basicClient(fetch).fetch("/services/v2/people/1")
        );
        yield* settle;
        yield* TestClock.adjust("1999 millis");
        expect(fetch).toHaveBeenCalledOnce();
        yield* TestClock.adjust("1 millis");
        yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestClock.layer()))
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up on a read after two retries", async () => {
    const fetch = fetchMock().mockImplementation(
      async () =>
        await Promise.resolve(
          jsonResponse({ error: "Temporarily unavailable" }, { status: 503 })
        )
    );
    const failure = await Effect.runPromise(
      Effect.gen(function* exhaustRetries() {
        const fiber = yield* Effect.forkChild(
          Effect.flip(basicClient(fetch).fetch("/services/v2/people/1"))
        );
        yield* settle;
        yield* TestClock.adjust("500 millis");
        yield* settle;
        yield* TestClock.adjust("1000 millis");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestClock.layer()))
    );
    expect(failure).toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("times out a stalled read attempt and retries it", async () => {
    const fetch = fetchMock()
      .mockImplementationOnce(hangUntilAborted)
      .mockResolvedValueOnce(jsonResponse({ data: person }));
    await Effect.runPromise(
      Effect.gen(function* retryTimedOutAttempt() {
        const fiber = yield* Effect.forkChild(
          basicClient(fetch).fetch("/services/v2/people/1")
        );
        yield* settle;
        yield* TestClock.adjust("15 seconds");
        yield* settle;
        expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBeTruthy();
        yield* TestClock.adjust("300 millis");
        yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestClock.layer()))
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a write after a transient error", async () => {
    const fetch = fetchMock().mockResolvedValue(
      jsonResponse({ error: "Temporarily unavailable" }, { status: 503 })
    );
    await expect(
      failureOf(
        basicClient(fetch).fetch("/services/v2/people", {
          method: "POST",
          body: {},
        })
      )
    ).resolves.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("labels fetch failures and malformed provider responses", async () => {
    const fetch = fetchMock()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(
        new Response("not json", {
          headers: { "content-type": "application/json" },
        })
      );
    const client = basicClient(fetch);
    await expect(
      failureOf(client.fetch("/services/v2/people/1"))
    ).resolves.toMatchObject({
      _tag: "PlanningCenterNetworkError",
      cause: { message: "network unavailable" },
    });
    await expect(
      failureOf(client.fetch("/services/v2/people/2"))
    ).resolves.toMatchObject({
      _tag: "PlanningCenterApiError",
      code: "INVALID_RESPONSE",
    });
  });

  it("stops an in-flight read without retrying when interrupted", async () => {
    const controller = new AbortController();
    const fetch = fetchMock().mockImplementation(async (input, init) => {
      controller.abort();
      return await hangUntilAborted(input, init);
    });
    const exit = await Effect.runPromiseExit(
      basicClient(fetch).fetch("/services/v2/people/1"),
      { signal: controller.signal }
    );
    expect(isInterrupted(exit)).toBeTruthy();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("stops a near-rate-limit pause when interrupted", async () => {
    const controller = new AbortController();
    const fetch = fetchMock().mockImplementationOnce(async () => {
      controller.abort();
      return await Promise.resolve(
        jsonResponse(
          { data: person },
          {
            headers: {
              "x-pco-api-request-rate-limit": "100",
              "x-pco-api-request-rate-count": "90",
            },
          }
        )
      );
    });
    const startedAt = performance.now();
    const exit = await Effect.runPromiseExit(
      basicClient(fetch).fetch("/services/v2/people/1"),
      { signal: controller.signal }
    );
    expect(isInterrupted(exit)).toBeTruthy();
    expect(performance.now() - startedAt).toBeLessThan(900);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
