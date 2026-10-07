import {
  makeProductClient,
  TransportFailure,
} from "@pcobooster/client/product-client";
import {
  callForQuery,
  retryTransientReadFailure,
} from "@pcobooster/client/query";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { ClientOutdated } from "@pcobooster/contracts/faults/client-outdated";
import { ExternalServiceFailure } from "@pcobooster/contracts/faults/external-service-failure";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { makeAppClient } from "../app-shell/app-client";
import { makeFixtureFetch } from "../harness/fixture-transport";
import { noCredentials } from "../session/session-store";
import {
  classifyApiFailure,
  makeApiFailureReporter,
  NETWORK_REPORT_INTERVAL_MS,
  operationFromQueryKey,
} from "./api-diagnostics";
import type { ApiFailureContext } from "./api-diagnostics";
import { callFailureOf } from "./call-failures";
import type { ReportDetails } from "./diagnostics-client";
import { syntheticBadGateway, syntheticUndecodable } from "./synthetic-answers";

const call = {
  requestId: "req-1",
  procedure: "catalog.plans",
  durationMs: 42.4,
};
const context: ApiFailureContext = {
  call,
  operation: null,
  speculative: false,
  online: true,
};

const badGateway = new ExternalServiceFailure({
  message: "Planning Center is unavailable",
  service: "planning-center",
  cause: null,
});

describe(classifyApiFailure, () => {
  it("reports a 5xx as a non-exception event joined to the Worker line by request ID", () => {
    expect(classifyApiFailure(badGateway, context)).toStrictEqual({
      kind: "event",
      details: {
        operation: "catalog.plans",
        error_code: "BAD_GATEWAY",
        http_status: 502,
        request_id: "req-1",
        duration_ms: 42,
      },
      dedupeKey: "catalog.plans|BAD_GATEWAY",
    });
  });

  it.each([
    ["a 404", new NotFound({ message: "Gone", resource: "plan" })],
    [
      "a rate limit",
      new RateLimited({ message: "Slow down", service: "planning-center" }),
    ],
    ["an abort", new DOMException("The call was aborted", "AbortError")],
  ])("ignores %s", (_name, cause) => {
    expect(classifyApiFailure(cause, context)).toStrictEqual({
      kind: "ignore",
    });
  });

  it("ignores speculative work and network failures while offline", () => {
    const network = new TransportFailure({
      procedure: "catalog.plans",
      reason: "network",
      cause: new TypeError("Network request failed"),
    });
    expect([
      classifyApiFailure(badGateway, { ...context, speculative: true }),
      classifyApiFailure(network, { ...context, online: false }),
    ]).toStrictEqual([{ kind: "ignore" }, { kind: "ignore" }]);
  });

  it("reports a network failure while connected as an exception with a synthetic message", () => {
    const network = new TransportFailure({
      procedure: "catalog.plans",
      reason: "network",
      cause: new TypeError(
        "Network request failed for https://pcobooster.com/api/v1/x"
      ),
    });
    expect(classifyApiFailure(network, context)).toStrictEqual({
      kind: "exception",
      type: "ApiTransportError",
      message: "catalog.plans failed (NETWORK_ERROR)",
      fingerprint: "mobile-api:catalog.plans:NETWORK_ERROR",
      details: {
        operation: "catalog.plans",
        error_code: "NETWORK_ERROR",
        request_id: "req-1",
        duration_ms: 42,
        failure_kind: "network",
      },
    });
  });

  it("reports an undecodable answer and names an unknown procedure as such", () => {
    const undecodable = new TransportFailure({
      procedure: null,
      reason: "undecodable",
      cause: new Error("<html>"),
    });
    expect(
      classifyApiFailure(undecodable, {
        ...context,
        call: null,
        operation: "not a procedure",
      })
    ).toMatchObject({
      kind: "exception",
      type: "ApiDecodeError",
      fingerprint: "mobile-api:unknown:UNDECODABLE",
    });
  });

  it("passes any other thrown value on as a defect, so bugs in query code are not hidden", () => {
    expect(
      classifyApiFailure(new TypeError("x is undefined"), context)
    ).toMatchObject({ kind: "defect" });
  });
});

describe(operationFromQueryKey, () => {
  it("reads the procedure tag a query key carries second", () => {
    expect([
      operationFromQueryKey(["user:u1", "catalog.plans", { id: 1 }]),
      operationFromQueryKey(["user:u1"]),
    ]).toStrictEqual(["catalog.plans", null]);
  });
});

const networkFailure = () =>
  new TransportFailure({ procedure: null, reason: "network", cause: null });

const recorder = () => {
  const events: { details: ReportDetails; dedupeKey: string }[] = [];
  const failures: string[] = [];
  const exceptions: unknown[] = [];
  const clock = { now: 0 };
  const report = makeApiFailureReporter(
    {
      captureEvent: (_event, details, dedupeKey) => {
        events.push({ details, dedupeKey });
      },
      captureFailure: ({ fingerprint }) => {
        failures.push(fingerprint);
      },
      captureException: (cause) => {
        exceptions.push(cause);
      },
    },
    () => clock.now
  );
  return { report, events, failures, exceptions, clock };
};

describe(makeApiFailureReporter, () => {
  it("reports an outdated client once per app session", () => {
    const { report, events } = recorder();
    const outdated = new ClientOutdated({
      message: "Update the app",
      minimumProtocolVersion: 2,
    });
    report(outdated, context);
    report(outdated, context);
    expect(events.map((event) => event.dedupeKey)).toStrictEqual([
      "CLIENT_OUTDATED",
    ]);
  });

  it("reports network failures at most once per five minutes", () => {
    const { report, failures, clock } = recorder();
    report(networkFailure(), context);
    clock.now = NETWORK_REPORT_INTERVAL_MS - 1;
    report(networkFailure(), context);
    clock.now = NETWORK_REPORT_INTERVAL_MS;
    report(networkFailure(), context);
    expect(failures).toHaveLength(2);
  });
});

/** The real client path: app client, `callForQuery`, and a query cache with retries. */
const queryHarness = (answers: (() => Response | Promise<Response>)[]) => {
  const fixtures = makeFixtureFetch({ latencyMs: 0 });
  const sentIds: string[] = [];
  let ids = 0;
  const product = makeProductClient({
    url: "https://api.test",
    client: "expo",
    credentials: "omit",
    fetch: async (input, init) => {
      sentIds.push(new Request(input, init).headers.get("x-request-id") ?? "");
      const answer = answers.shift();
      return answer === undefined
        ? await fixtures(input, init)
        : await answer();
    },
  });
  const client = makeAppClient(
    product,
    { credentials: () => noCredentials, handleUnauthorized: () => {} },
    createRequestScheduler({ quietMs: 0 }),
    {
      newRequestId: () => {
        ids += 1;
        return `req-${ids}`;
      },
      now: () => ids * 10,
    }
  );
  const { report, events, failures } = recorder();
  const queries = new QueryClient({
    defaultOptions: {
      queries: { retry: retryTransientReadFailure, retryDelay: 0 },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        report(error, {
          call: callFailureOf(error),
          operation: operationFromQueryKey(query.queryKey),
          speculative: false,
          online: true,
        });
      },
    }),
  });
  const fetchOrganization = async () => {
    try {
      await queries.query({
        queryKey: ["scope", "catalog.organization"],
        queryFn: async (queryContext) =>
          await callForQuery(queryContext, client, (api) =>
            api.catalog.organization()
          ),
      });
    } catch {
      /* The cache's onError is what these tests observe. */
    }
  };
  return { fetchOrganization, sentIds, events, failures };
};

describe("terminal query failures through the app client", () => {
  it("reports nothing when the automatic retry recovers", async () => {
    const harness = queryHarness([syntheticBadGateway]);
    await harness.fetchOrganization();
    expect([harness.sentIds, harness.events]).toStrictEqual([
      ["req-1", "req-2"],
      [],
    ]);
  });

  it("reports a 5xx once, after the retry, with the last attempt's request ID", async () => {
    const harness = queryHarness([syntheticBadGateway, syntheticBadGateway]);
    await harness.fetchOrganization();
    expect(harness.sentIds).toStrictEqual(["req-1", "req-2"]);
    expect(harness.events).toStrictEqual([
      {
        details: {
          operation: "catalog.organization",
          error_code: "BAD_GATEWAY",
          http_status: 502,
          request_id: "req-2",
          duration_ms: 0,
        },
        dedupeKey: "catalog.organization|BAD_GATEWAY",
      },
    ]);
  });

  it("reports an undecodable answer as an exception after its retry", async () => {
    const harness = queryHarness([syntheticUndecodable, syntheticUndecodable]);
    await harness.fetchOrganization();
    expect(harness.failures).toStrictEqual([
      "mobile-api:catalog.organization:UNDECODABLE",
    ]);
  });
});
