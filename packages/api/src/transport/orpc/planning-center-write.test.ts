import { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { createApplicationRuntime } from "@pcobooster/api/application/runtime";
import {
  createPlanningCenterServices,
  createPlanningCenterReadCaches,
} from "@pcobooster/api/planning-center/services/factory";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { testServer } from "@pcobooster/api/testing/server";
import { executePreparedPlanningCenterWrite } from "@pcobooster/api/transport/orpc/planning-center-write";
import { Effect, Layer } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { describe, expect, it, vi } from "vitest";

describe(executePreparedPlanningCenterWrite, () => {
  it("uses the same credential and cache scope for preflight and commit", async () => {
    const authorize = vi.fn<PlanningCenterAccessDependencies["authorize"]>(
      async () => {
        await Promise.resolve();
        return {
          kind: "account",
          userId: "user-1",
          accessToken: "credential-1",
          scopes: ["services"],
          accountId: "account-1",
          account: { id: "account-1", accountId: "provider-1" },
        };
      }
    );
    const dependencies: PlanningCenterAccessDependencies = {
      authorize,
      createServices: (authentication, httpClient) =>
        createPlanningCenterServices(
          authentication.kind === "account" ? authentication.accessToken : "",
          "America/Los_Angeles",
          httpClient,
          createPlanningCenterReadCaches(null)
        ),
      presentationMode: () => false,
      presentationSeed: "test-seed",
    };
    const runtime = createApplicationRuntime(
      Layer.succeed(HttpClient.HttpClient, unreachableHttpClient)
    );
    const context = {
      request: new Request("https://pcobooster.com/api/rpc/plan-items"),
      requestId: "request-1",
      server: testServer(),
    };

    try {
      const result = await executePreparedPlanningCenterWrite(
        runtime,
        context,
        context.request.signal,
        Effect.gen(function* prepare() {
          const access = yield* PlanningCenterAccess;
          return access.cacheScope;
        }),
        (preparedScope) =>
          Effect.gen(function* commit() {
            const access = yield* PlanningCenterAccess;
            return { preparedScope, committedScope: access.cacheScope };
          }),
        dependencies
      );

      expect(authorize).toHaveBeenCalledOnce();
      expect(result.preparedScope).toBe(result.committedScope);
      expect(result.preparedScope).toMatch(/^bearer:/u);
    } finally {
      await runtime.dispose();
    }
  });
});
