import { makeProductClient } from "@pcobooster/client/product-client";
import {
  callForQuery,
  retryTransientReadFailure,
} from "@pcobooster/client/query";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { describe, expect, it } from "vitest";

import { makeAppClient } from "../app-shell/app-client";
import { makeScopedQueryClient } from "../app-shell/scoped-query-client";
import { makeFixtureFetch } from "../harness/fixture-transport";
import { noCredentials } from "../session/session-store";
import { makeApiFailureReporter } from "./api-diagnostics";
import { makeDiagnostics } from "./diagnostics-client";
import type { CapturedEvent } from "./diagnostics-client";
import { withApiProbe } from "./probe-transport";
import type { ApiProbe } from "./probe-transport";

const SCOPE = "user:u1:acct:id";

/**
 * A verification build's launch: the probed transport under the app client, the per-scope query
 * cache with the app's retry policy, the API failure reporter, and diagnostics signed in.
 */
const probedApp = (probe: ApiProbe) => {
  const worker: string[] = [];
  const sent: CapturedEvent[] = [];
  const fixtures = makeFixtureFetch({ latencyMs: 0 });
  const diagnostics = makeDiagnostics({
    enabled: true,
    release: {
      version: "0.1.0",
      build: "372",
      revision: "a".repeat(40),
      namespace: "com.pcobooster.ios",
      osName: "iOS",
      osVersion: "26.0",
    },
    pending: null,
    transport: async (events) => {
      sent.push(...events);
      return await Promise.resolve(true);
    },
    verificationBuild: true,
  });
  diagnostics.setPreference("opted-in");
  diagnostics.setSession({ kind: "signed-in", userId: "u1" });
  const product = makeProductClient({
    url: "https://api.test",
    client: "expo",
    credentials: "omit",
    fetch: withApiProbe(async (input, init) => {
      const request = new Request(input, init);
      worker.push(
        `${new URL(request.url).pathname} ${request.headers.get("x-request-id")}`
      );
      return await fixtures(input, init);
    }, probe),
  });
  let ids = 0;
  const client = makeAppClient(
    product,
    {
      credentials: () => noCredentials,
      handleUnauthorized: () => {},
      scope: () => SCOPE,
    },
    createRequestScheduler({ quietMs: 0 }),
    {
      newRequestId: () => {
        ids += 1;
        return `request-${ids}`;
      },
      now: () => 0,
      origin: diagnostics.origin,
    }
  ).forScope(SCOPE);
  const cache = makeScopedQueryClient(
    SCOPE,
    { queries: { retry: retryTransientReadFailure, retryDelay: 0 } },
    {
      report: makeApiFailureReporter(diagnostics),
      origin: diagnostics.origin,
      currentScope: () => SCOPE,
      online: () => true,
    }
  );
  const readOrganization = async (): Promise<string> => {
    try {
      const organization = await cache.query({
        queryKey: [SCOPE, "catalog.organization"],
        queryFn: async (context) =>
          await callForQuery(context, client, (api) =>
            api.catalog.organization()
          ),
        staleTime: 0,
      });
      return organization.timeZone;
    } catch {
      return "failed";
    } finally {
      await diagnostics.settled();
    }
  };
  const status = async () => {
    await client.run((api) => api.session.status());
  };
  return { worker, sent, readOrganization, status, cache };
};

const terminal = (sent: readonly CapturedEvent[]) =>
  sent.map((event) => ({
    event: event.event,
    type: event.properties.$exception_list?.[0]?.type,
    error_code: event.properties.error_code,
    request_id: event.properties.request_id,
    verification_build: event.properties.verification_build,
  }));

describe("a verification build's API probes through the app's retry policy", () => {
  it("api-5xx fails the read through its retry and reports it once, with the last request's ID", async () => {
    const app = probedApp("api-5xx");
    await app.status();
    const first = await app.readOrganization();
    const later = await app.readOrganization();
    expect([first, later !== "failed"]).toStrictEqual(["failed", true]);
    expect(app.worker).toStrictEqual([
      "/api/v1/session request-1",
      "/api/v1/organization request-2",
      "/api/v1/organization request-3",
      "/api/v1/organization request-4",
    ]);
    expect(terminal(app.sent)).toStrictEqual([
      {
        event: "api request failed",
        type: undefined,
        error_code: "BAD_GATEWAY",
        request_id: "request-3",
        verification_build: true,
      },
    ]);
  });

  it("api-undecodable reports one ApiDecodeError after the retry", async () => {
    const app = probedApp("api-undecodable");
    await expect(app.readOrganization()).resolves.toBe("failed");
    expect([app.worker.length, terminal(app.sent)]).toStrictEqual([
      2,
      [
        {
          event: "$exception",
          type: "ApiDecodeError",
          error_code: "UNDECODABLE",
          request_id: "request-2",
          verification_build: true,
        },
      ],
    ]);
  });

  it("api-network reports one ApiTransportError and sends nothing to the Worker", async () => {
    const app = probedApp("api-network");
    await expect(app.readOrganization()).resolves.toBe("failed");
    expect([app.worker, terminal(app.sent)]).toStrictEqual([
      [],
      [
        {
          event: "$exception",
          type: "ApiTransportError",
          error_code: "NETWORK_ERROR",
          request_id: "request-2",
          verification_build: true,
        },
      ],
    ]);
  });

  it("api-5xx-transient recovers on the retry and reports nothing", async () => {
    const app = probedApp("api-5xx-transient");
    const zone = await app.readOrganization();
    expect([zone !== "failed", app.worker.length, app.sent]).toStrictEqual([
      true,
      2,
      [],
    ]);
  });
});
