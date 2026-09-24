import { RequestContext } from "@pcobooster/api/application/context";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { createApplicationRuntime } from "@pcobooster/api/application/runtime";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { testServer } from "@pcobooster/api/testing/server";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { Effect, Layer } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { describe, expect, it } from "vitest";

const createRpcContext = () => ({
  request: new Request("https://pcobooster.com/api/rpc/health"),
  requestId: "request-1",
  server: testServer(),
});

describe(executeApplicationEffect, () => {
  it("provides request context to an Effect program", async () => {
    const runtime = createApplicationRuntime(
      Layer.succeed(HttpClient.HttpClient, unreachableHttpClient)
    );

    try {
      await expect(
        executeApplicationEffect(
          runtime,
          Effect.gen(function* readRequestId() {
            const { requestId } = yield* RequestContext;
            return requestId;
          }),
          createRpcContext()
        )
      ).resolves.toBe("request-1");
    } finally {
      await runtime.dispose();
    }
  });

  it("maps typed application faults to oRPC errors", async () => {
    const runtime = createApplicationRuntime(
      Layer.succeed(HttpClient.HttpClient, unreachableHttpClient)
    );

    try {
      const result = executeApplicationEffect(
        runtime,
        Effect.fail(new Forbidden({ message: "Admin access required" })),
        createRpcContext()
      );
      await expect(result).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Admin access required",
        data: { message: "Admin access required" },
        status: 403,
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps defects opaque", async () => {
    const runtime = createApplicationRuntime(
      Layer.succeed(HttpClient.HttpClient, unreachableHttpClient)
    );
    const defect = new Error("Database credentials leaked here");

    try {
      const result = executeApplicationEffect(
        runtime,
        Effect.die(defect),
        createRpcContext()
      );
      await expect(result).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
      });
    } finally {
      await runtime.dispose();
    }
  });
});
