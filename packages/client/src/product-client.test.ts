import {
  failureCode,
  failureMessage,
  failureStatus,
  makeProductClient,
  TransportFailure,
} from "@pcobooster/client/product-client";
import type { ProductClient } from "@pcobooster/client/product-client";
import { ClientOutdated } from "@pcobooster/contracts/faults/client-outdated";
import { Conflict } from "@pcobooster/contracts/faults/conflict";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import { describe, expect, it } from "vitest";

/** A client whose every call is answered by `respond`, recording each request it sent. */
const clientAnswering = (respond: (request: Request) => Response) => {
  const sent: Request[] = [];
  const client = makeProductClient({
    url: "https://api.example",
    client: "web",
    credentials: "include",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      sent.push(request);
      return await Promise.resolve(respond(request));
    },
  });
  return { client, sent };
};

/** Never called: it only has to compile, with the expected error. */
const speculativeWrite = async (typed: ProductClient) =>
  await typed.call(
    "schedule.remove",
    { planPersonId: "1", serviceTypeId: "2", planId: "3" },
    // @ts-expect-error A write always goes out interactive.
    { priority: "speculative" }
  );

/** Never called: a procedure that takes input cannot be called without it. */
const missingInput = async (typed: ProductClient) =>
  // @ts-expect-error catalog.plan needs its service type and plan.
  await typed.call("catalog.plan");

describe(makeProductClient, () => {
  it("sends each part of the input where its route puts it", async () => {
    const { client, sent } = clientAnswering((request) => {
      const { pathname } = new URL(request.url);
      if (pathname.endsWith("/adjacent")) {
        return Response.json([]);
      }
      return pathname.endsWith("/plan-window-history")
        ? Response.json({
            generatedAt: "2026-10-11T17:00:00Z",
            loadedPlanCount: 0,
            plans: [],
            planTimes: [],
            people: [],
            deferredPlans: [],
            deferredServiceTypeIds: [],
            requestBudget: {
              limit: 40,
              planningCenterRequests: 0,
              planRangeRequests: 0,
              rosterRequests: 0,
            },
          })
        : Response.json({ success: true });
    });

    await client.call("catalog.adjacentPlans", {
      serviceTypeId: "st 1",
      planId: "plan-1",
      direction: "next",
    });
    await client.call("people.planWindowHistory", {
      date: "2026-10-11T17:00:00Z",
      continuation: { plans: [], serviceTypeIds: ["st-2"] },
    });
    await client.call("schedule.remove", {
      planPersonId: "pp-1",
      serviceTypeId: "st-1",
      planId: "plan-1",
    });
    const requests = await Promise.all(
      sent.map(async (request) => [
        request.method,
        request.url,
        await request.clone().text(),
      ])
    );

    expect(requests).toStrictEqual([
      [
        "GET",
        "https://api.example/api/v1/service-types/st%201/plans/plan-1/adjacent?direction=next",
        "",
      ],
      [
        "POST",
        "https://api.example/api/v1/people/plan-window-history",
        JSON.stringify({
          date: "2026-10-11T17:00:00Z",
          continuation: { plans: [], serviceTypeIds: ["st-2"] },
        }),
      ],
      [
        "DELETE",
        "https://api.example/api/v1/plan-people/pp-1?serviceTypeId=st-1&planId=plan-1",
        "",
      ],
    ]);
    await client.dispose();
  });

  it("calls a procedure that takes no input without one", async () => {
    const { client, sent } = clientAnswering(() =>
      Response.json({ people: true, chordCharts: false })
    );

    await expect(client.call("features.status")).resolves.toStrictEqual({
      people: true,
      chordCharts: false,
    });
    expect(missingInput).toBeTypeOf("function");
    expect(sent.map((request) => request.url)).toStrictEqual([
      "https://api.example/api/v1/features",
    ]);
    await client.dispose();
  });

  it("rejects with the fault class the server answered with, decoded by status", async () => {
    const { client, sent } = clientAnswering(() =>
      Response.json(
        { _tag: "NotFound", message: "No plan", resource: "plan" },
        { status: 404 }
      )
    );

    await expect(
      client.call("catalog.plan", { serviceTypeId: "1", planId: "2" })
    ).rejects.toBeInstanceOf(NotFound);
    expect(
      sent.map((request) => request.headers.get("x-pcobooster-client"))
    ).toStrictEqual(["web;api=1"]);
    await client.dispose();
  });

  it("reports a response the API does not declare as a transport failure", async () => {
    const { client } = clientAnswering(
      () => new Response("<html>Bad gateway</html>", { status: 502 })
    );
    const call = client.call("health");

    await expect(call).rejects.toBeInstanceOf(TransportFailure);
    await expect(call).rejects.toMatchObject({
      tag: "health",
      reason: "undecodable",
    });
    await client.dispose();
  });

  it("gives a network failure a message a person can act on", async () => {
    const client = makeProductClient({
      url: "https://api.example",
      client: "web",
      fetch: async () => {
        await Promise.resolve();
        throw new TypeError("Failed to fetch");
      },
    });
    const call = client.call("health");

    await expect(call).rejects.toBeInstanceOf(TransportFailure);
    await expect(call).rejects.toMatchObject({
      reason: "network",
      message:
        "Couldn't reach pcobooster. Check your connection and try again.",
    });
    await client.dispose();
  });

  it("rejects with AbortError when the signal aborts", async () => {
    const { client, sent } = clientAnswering(() => Response.json([]));
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.call("health", undefined, { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sent).toStrictEqual([]);
    await client.dispose();
  });

  it("sends reads at speculative priority, and refuses that priority for writes at compile time", async () => {
    const { client, sent } = clientAnswering(() => Response.json([]));

    await client.call("catalog.serviceTypes", undefined, {
      priority: "speculative",
    });

    expect(speculativeWrite).toBeTypeOf("function");
    expect(sent[0]?.headers.get("x-pcobooster-priority")).toBe("speculative");
    await client.dispose();
  });
});

describe(failureStatus, () => {
  it.each([
    [new NotFound({ message: "No plan", resource: "plan" }), 404, "NOT_FOUND"],
    [
      new RateLimited({ message: "held back", service: "planning-center" }),
      429,
      "TOO_MANY_REQUESTS",
    ],
    [
      new ClientOutdated({ message: "Reload", minimumProtocolVersion: 2 }),
      426,
      "CLIENT_OUTDATED",
    ],
    [
      new TransportFailure({ tag: "health", reason: "network", cause: null }),
      503,
      "NETWORK_ERROR",
    ],
    [new TypeError("not a call failure"), undefined, undefined],
  ])("reads %o as %s", (failure, status, code) => {
    expect({
      status: failureStatus(failure),
      code: failureCode(failure),
    }).toStrictEqual({ status, code });
  });
});

describe(failureMessage, () => {
  it.each([
    [
      new Conflict({ message: "Someone else saved first", reason: "stale" }),
      "Someone else saved first",
    ],
    [new Conflict({ message: "", reason: "stale" }), "Fallback"],
    [
      new TransportFailure({ tag: "health", reason: "network", cause: null }),
      "Couldn't reach pcobooster. Check your connection and try again.",
    ],
    [new TypeError("private diagnostic"), "Fallback"],
  ])("reads %o as %s", (failure, message) => {
    expect(failureMessage(failure, "Fallback")).toBe(message);
  });
});
