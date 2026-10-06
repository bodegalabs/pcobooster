/**
 * What every procedure gets from the Effect RPC transport: the previous transport's tests
 * (fault mapping, procedure wiring, Planning Center accounting) and the RPC half of
 * `app.test.ts`, ported to run against the route.
 */
import type {
  PlanningCenterAccessDependencies,
  RequestAuthentication,
} from "@pcobooster/api/application/planning-center-access";
import {
  createPlanningCenterReadCaches,
  createPlanningCenterServices,
} from "@pcobooster/api/planning-center/services/factory";
import type { ReportProcedureFailure } from "@pcobooster/api/rpc/outcome";
import { httpClientFor } from "@pcobooster/api/testing/http-client";
import { testServer } from "@pcobooster/api/testing/server";
import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { InternalError } from "@pcobooster/contracts/faults/internal-error";
import { RequestRejected } from "@pcobooster/contracts/faults/request-rejected";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import { Effect, Tracer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { postHogProcedureReporter } from "./rpc-route";
import { serveRpcForTest, TEST_RPC_URL } from "./test-rpc";
import type { RpcRouteTestOptions } from "./test-rpc";

const privateNoStore = "private, no-store";
const PLAN_PATH = /\/plans\/(?<planId>[^/]+)$/u;

const accountAuthentication: RequestAuthentication = {
  kind: "account",
  userId: "user-1",
  accessToken: "access-token",
  scopes: ["services"],
  accountId: "account-1",
  account: { id: "account-1", accountId: "provider-account-1" },
};

/** Access that `authorize` decides; services send through the route's HTTP client. */
const accessWith = (
  authorize: PlanningCenterAccessDependencies["authorize"]
): PlanningCenterAccessDependencies => ({
  authorize,
  createServices: (_authentication, httpClient) =>
    createPlanningCenterServices(
      "access-token",
      "America/Los_Angeles",
      httpClient,
      createPlanningCenterReadCaches(null)
    ),
  presentationMode: () => false,
  presentationSeed: "seed",
});

const signedIn = accessWith(
  async () => await Promise.resolve(accountAuthentication)
);

/** A Planning Center that answers every plan read, counting requests. */
const planningCenter = () => {
  const requests: string[] = [];
  const httpClient = httpClientFor(async (input) => {
    const url = new URL(new Request(input).url);
    requests.push(url.pathname);
    const planId = PLAN_PATH.exec(url.pathname)?.groups?.planId ?? "missing";
    return await Promise.resolve(
      Response.json({
        data: {
          type: "Plan",
          id: planId,
          attributes: {
            title: "Sunday",
            sort_date: "2026-10-11T17:00:00Z",
            created_at: "2026-09-01T00:00:00Z",
            planning_center_url: null,
          },
          relationships: { series: { data: null } },
        },
        included: [],
      })
    );
  });
  return { requests, httpClient };
};

/** A Planning Center whose people search finds Ann, recording each search term it was sent. */
const peopleDirectory = () => {
  const searches: (string | null)[] = [];
  const httpClient = httpClientFor(async (input) => {
    searches.push(
      new URL(new Request(input).url).searchParams.get("where[search_name]")
    );
    return await Promise.resolve(
      Response.json({
        data: [
          {
            type: "Person",
            id: "person-1",
            attributes: { first_name: "Ann", last_name: "Lee", avatar: null },
            relationships: {},
          },
        ],
        included: [],
        meta: { total_count: 1 },
      })
    );
  });
  return { searches, httpClient };
};

const rawRpc = (
  tag: string,
  payload: JsonValue,
  headers: Record<string, string> = {}
) =>
  new Request(TEST_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      _tag: "Request",
      id: "1",
      tag,
      payload,
      headers: [],
    }),
  });

const serve = (options: Partial<RpcRouteTestOptions> = {}) =>
  serveRpcForTest({ server: testServer(), access: signedIn, ...options });

const outcomeLines = (route: ReturnType<typeof serveRpcForTest>) =>
  route.logs.filter((line) => line.message === "rpc");

const recordingReporter = () => {
  const reports: Parameters<ReportProcedureFailure>[0][] = [];
  const report: ReportProcedureFailure = (failure) =>
    Effect.sync(() => {
      reports.push(failure);
    });
  return { reports, report };
};

describe("faults on the Effect RPC route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers a product fault with main's status and code, logs it at info, and never reports it", async () => {
    const { reports, report } = recordingReporter();
    const route = serve({
      access: accessWith(async () => {
        await Promise.resolve();
        throw new Forbidden({ message: "Admin access required" });
      }),
      report,
    });

    const raw = await route.fetch(
      rawRpc("access.me", {}, { "x-request-id": "request-403" })
    );
    const answer = route.client().call("access.me", {});

    await expect(answer).rejects.toBeInstanceOf(Forbidden);
    await expect(answer).rejects.toMatchObject({
      message: "Admin access required",
    });
    expect([raw.status, raw.headers.get("cache-control")]).toStrictEqual([
      403,
      privateNoStore,
    ]);
    expect(outcomeLines(route)[0]).toMatchObject({
      level: "info",
      fields: {
        procedure: "access.me",
        requestId: "request-403",
        status: 403,
        code: "FORBIDDEN",
      },
    });
    expect(reports).toStrictEqual([]);
  });

  it("keeps a defect out of the response, logs it with the request id, and reports it", async () => {
    const { reports, report } = recordingReporter();
    const route = serve({
      access: accessWith(async () => {
        await Promise.resolve();
        throw new Error("private database diagnostic");
      }),
      report,
    });

    const raw = await route.fetch(
      rawRpc("access.me", {}, { "x-request-id": "request-123" })
    );
    const body = await raw.text();

    await expect(route.client().call("access.me", {})).rejects.toBeInstanceOf(
      InternalError
    );
    expect({
      status: raw.status,
      cacheControl: raw.headers.get("cache-control"),
      answersInternalError: body.includes("InternalError"),
      leaksDiagnostic: body.includes("private database diagnostic"),
    }).toStrictEqual({
      status: 500,
      cacheControl: privateNoStore,
      answersInternalError: true,
      leaksDiagnostic: false,
    });
    expect(outcomeLines(route)[0]).toMatchObject({
      level: "error",
      fields: {
        procedure: "access.me",
        requestId: "request-123",
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
      },
    });
    expect(reports[0]?.fields).toMatchObject({
      procedure: "access.me",
      requestId: "request-123",
      status: 500,
    });
    expect(reports[0]?.error.message).toBe("private database diagnostic");
  });

  it("still answers when error reporting fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        await Promise.reject(new Error("PostHog down"));
        return new Response();
      })
    );
    const route = serve({
      access: accessWith(async () => {
        await Promise.resolve();
        throw new Error("private database diagnostic");
      }),
      report: postHogProcedureReporter("phc_test_key"),
    });

    const raw = await route.fetch(rawRpc("access.me", {}));

    expect(raw.status).toBe(500);
    expect(
      route.logs.find(
        (line) => line.message === "Failed to report exception to PostHog"
      )
    ).toMatchObject({ level: "error", fields: { procedure: "access.me" } });
  });

  it("answers an unknown procedure with 400 RequestRejected before any handler", async () => {
    const { reports, report } = recordingReporter();
    const route = serve({ report });

    const raw = await route.fetch(rawRpc("access.missing", {}));

    expect([raw.status, raw.headers.get("cache-control")]).toStrictEqual([
      400,
      privateNoStore,
    ]);
    await expect(raw.text()).resolves.toContain("unknown-procedure");
    expect(outcomeLines(route)).toMatchObject([
      {
        level: "info",
        fields: { procedure: "access.missing", status: 400, kind: null },
      },
    ]);
    expect(reports).toStrictEqual([]);
  });
});

describe("payload decoding", () => {
  it("sends input as the caller wrote it, so the server trims a people search as main's did", async () => {
    const { searches, httpClient } = peopleDirectory();
    const route = serve({ httpClient });

    const results = await route
      .client()
      .call("people.search", { query: " ann " });

    expect({ results, searches }).toStrictEqual({
      results: [
        {
          id: "person-1",
          firstName: "Ann",
          lastName: "Lee",
          fullName: "Ann Lee",
          photoThumbnailUrl: null,
        },
      ],
      searches: ["ann"],
    });
  });

  it("leaves rejecting input to the server, which answers RequestRejected", async () => {
    const { searches, httpClient } = peopleDirectory();
    const route = serve({ httpClient });

    const call = route.client().call("people.search", { query: " a " });

    await expect(call).rejects.toBeInstanceOf(RequestRejected);
    expect(searches).toStrictEqual([]);
  });
});

describe("what each procedure runs with", () => {
  it("carries Dates through the transport as ISO strings, decoded back into Dates", async () => {
    const { httpClient } = planningCenter();
    const route = serve({ httpClient });

    const plan = await route
      .client()
      .call("catalog.plan", { serviceTypeId: "st-1", planId: "plan-1" });
    const raw = await route.fetch(
      rawRpc("catalog.plan", { serviceTypeId: "st-1", planId: "plan-1" })
    );

    expect(plan?.createdAt).toStrictEqual(new Date("2026-09-01T00:00:00Z"));
    await expect(raw.text()).resolves.toContain(
      '"createdAt":"2026-09-01T00:00:00.000Z"'
    );
  });

  it("gives every procedure its own Planning Center accounting under the 40-request cap", async () => {
    const { httpClient, requests } = planningCenter();
    const route = serve({ httpClient });
    const client = route.client();

    await client.call("catalog.plan", { serviceTypeId: "st-1", planId: "a" });
    await client.call(
      "catalog.plan",
      { serviceTypeId: "st-1", planId: "b" },
      { priority: "speculative" }
    );

    expect(requests).toHaveLength(2);
    expect(
      outcomeLines(route).map(({ fields }) => ({
        priority: fields.priority,
        planningCenterRequests: fields.planningCenterRequests,
        rateLimitPauses: fields.rateLimitPauses,
        rateLimitRejections: fields.rateLimitRejections,
        requestBudget: fields.requestBudget,
      }))
    ).toStrictEqual([
      {
        priority: "interactive",
        planningCenterRequests: 1,
        rateLimitPauses: 0,
        rateLimitRejections: 0,
        requestBudget: 40,
      },
      {
        priority: "speculative",
        planningCenterRequests: 1,
        rateLimitPauses: 0,
        rateLimitRejections: 0,
        requestBudget: 40,
      },
    ]);
  });

  it("runs each procedure in a span named after it, with its procedure and request id", async () => {
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const { httpClient } = planningCenter();
    const route = serve({ httpClient, tracer });

    await route.fetch(
      rawRpc(
        "catalog.plan",
        { serviceTypeId: "st-1", planId: "plan-1" },
        { "x-request-id": "request-span" }
      )
    );
    const procedureSpan = spans.find(
      (span) => span.name === "rpc.catalog.plan"
    );

    expect({
      procedure: procedureSpan?.attributes.get("rpc.procedure"),
      requestId: procedureSpan?.attributes.get("request.id"),
    }).toStrictEqual({ procedure: "catalog.plan", requestId: "request-span" });
  });
});
