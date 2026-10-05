import type { BoundaryLog } from "@pcobooster/api/logging";
import type { ReportRequestError } from "@pcobooster/api/modules/analytics/posthog-exception";
import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import { createRpcClient } from "@pcobooster/client/rpc";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import { createServerApp } from "./app";
import { serveForTest } from "./test-app";

const allowedOrigin = "https://pcobooster.com";
const server = testServer({
  config: testServerConfig({ BETTER_AUTH_URL: allowedOrigin }),
});
const createTestApp = (authHandler = () => new Response("auth")) =>
  serveForTest(
    createServerApp({
      server,
      authHandler,
      log: { error: vi.fn<BoundaryLog["error"]>() },
    })
  );
const rpcRequest = (tag: string) =>
  new Request("http://localhost/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { _tag: "Request", id: "0", tag, payload: {}, headers: [] },
    ]),
  });
const rpcResponses = Schema.Array(
  Schema.Struct({
    _tag: Schema.String,
    exit: Schema.optionalKey(Schema.Unknown),
  })
);

describe(createServerApp, () => {
  it("serves ordinary health/version and rejects obsolete procedure URLs", async () => {
    const app = createTestApp();
    const health = await app.request("/health");
    const version = await app.request("/version");
    const oldHealth = await app.request("/api/rpc/health", { method: "POST" });
    const oldReference = await app.request("/api/reference/health");
    await expect(health.json()).resolves.toStrictEqual({ status: "ok" });
    await expect(version.json()).resolves.toStrictEqual({
      version: "development",
    });
    expect(oldHealth.status).toBe(404);
    expect(oldReference.status).toBe(404);
  });

  it("rejects batches before any procedure can consume the invocation budget", async () => {
    const response = await createTestApp().request("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          _tag: "Request",
          id: "0",
          tag: "demo.exit",
          payload: {},
          headers: [],
        },
        {
          _tag: "Request",
          id: "1",
          tag: "demo.exit",
          payload: {},
          headers: [],
        },
      ]),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("serves the shared native client using its actual HTTP serialization", async () => {
    const app = createTestApp();
    const responses: Response[] = [];
    const client = createRpcClient({
      url: () => "http://localhost/api/rpc",
      fetch: async (input, init) => await app.request(new Request(input, init)),
      onResponse: (response) => {
        responses.push(response);
      },
    });
    await expect(client.call("demo.exit", {})).resolves.toStrictEqual({
      demo: false,
    });
    expect(responses[0]?.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(responses[0]?.headers.get("Cache-Control")).toBe(
      "private, no-store"
    );
  });

  it("serves native Effect RPC and preserves response cookies", async () => {
    const app = createTestApp();
    const response = await app.request(rpcRequest("demo.exit"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(
      Schema.decodeUnknownSync(rpcResponses)(await response.json())
    ).toContainEqual(
      expect.objectContaining({
        _tag: "Exit",
        exit: { _tag: "Success", value: { demo: false } },
      })
    );
  });

  it("keeps unexpected defects opaque and reports them", async () => {
    const log = { error: vi.fn<BoundaryLog["error"]>() };
    const reportError = vi.fn<ReportRequestError>(async () => {
      await Promise.resolve();
    });
    const app = serveForTest(createServerApp({ server, log, reportError }));
    const response = await app.request(rpcRequest("catalog.serviceTypes"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("INTERNAL_SERVER_ERROR");
    expect(body).not.toContain("This test did not provide Better Auth");
    expect(log.error).toHaveBeenCalledWith(
      "Effect RPC request failed",
      expect.objectContaining({ method: "POST", path: "/api/rpc" }),
      expect.any(Error)
    );
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("answers failed RPCs when exception reporting fails", async () => {
    const log = { error: vi.fn<BoundaryLog["error"]>() };
    const app = serveForTest(
      createServerApp({
        server,
        log,
        reportError: async () => {
          await Promise.reject(new Error("PostHog down"));
        },
      })
    );
    const response = await app.request(rpcRequest("catalog.serviceTypes"));
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("INTERNAL_SERVER_ERROR");
    expect(log.error).toHaveBeenCalledWith(
      "Failed to report exception to PostHog",
      expect.objectContaining({ path: "/api/rpc" }),
      expect.any(Error)
    );
  });

  it("answers credentialed preflight including native account/demo/priority headers", async () => {
    const response = await createTestApp().request("/api/rpc", {
      method: "OPTIONS",
      headers: { Origin: allowedOrigin },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      allowedOrigin
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    for (const header of [
      "Authorization",
      "x-pcobooster-account",
      "x-pcobooster-demo",
      "x-pcobooster-priority",
    ]) {
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
        header
      );
    }
  });

  it("passes Better Auth request bodies and response cookies through", async () => {
    const authHandler = vi.fn<(request: Request) => Promise<Response>>(
      async (request) => {
        await expect(request.json()).resolves.toStrictEqual({
          provider: "test",
        });
        return Response.json(
          { authenticated: true },
          {
            status: 201,
            headers: { "Set-Cookie": "session=test; Path=/; HttpOnly" },
          }
        );
      }
    );
    const response = await serveForTest(
      createServerApp({
        server,
        authHandler,
        log: { error: vi.fn<BoundaryLog["error"]>() },
      })
    ).request("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ provider: "test" }),
    });
    expect(authHandler).toHaveBeenCalledOnce();
    expect(response.status).toBe(201);
    expect(response.headers.get("Set-Cookie")).toBe(
      "session=test; Path=/; HttpOnly"
    );
  });

  it("counts native start/exchange against the auth limiter and exempts callback/session reads", async () => {
    const authHandler = vi.fn<() => Response>(() => new Response("auth"));
    const allowAuthWrite = vi.fn<(ip: string) => Promise<boolean>>(
      async () => await Promise.resolve(false)
    );
    const app = serveForTest(
      createServerApp({
        server,
        authHandler,
        allowAuthWrite,
        log: { error: vi.fn<BoundaryLog["error"]>() },
      })
    );
    const headers = { "cf-connecting-ip": "203.0.113.7" };
    const start = await app.request("/api/auth/native/start", { headers });
    const exchange = await app.request("/api/auth/native/exchange", {
      headers,
      method: "POST",
    });
    const callback = await app.request("/api/auth/callback/planning-center", {
      headers,
    });
    const session = await app.request("/api/auth/get-session", { headers });
    const anonymous = await app.request("/api/auth/sign-out", {
      method: "POST",
    });
    expect([
      start.status,
      exchange.status,
      callback.status,
      session.status,
      anonymous.status,
    ]).toStrictEqual([429, 429, 200, 200, 200]);
    expect(start.headers.get("Retry-After")).toBe("60");
    expect(allowAuthWrite).toHaveBeenCalledTimes(2);
  });
});
