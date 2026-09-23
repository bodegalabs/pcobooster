import { ORPCError, os } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createServerApp } from "./app";

const allowedOrigin = "https://pcobooster.com";
const recordedAt = new Date("2026-09-19T12:34:56.000Z");
const privateNoStore = "private, no-store";
type TestAuthHandler = (request: Request) => Promise<Response> | Response;
type TestErrorLogger = (
  bindings: {
    err: unknown;
    requestId?: string;
    path?: string;
    method?: string;
  },
  message: string
) => void;

const testProcedure = os.$context<{ resHeaders?: Headers }>();

const procedureWithErrors = testProcedure.errors({
  FORBIDDEN: {
    data: z.object({ message: z.string() }),
    status: 403,
  },
});

const testRouter = {
  cookie: testProcedure.input(z.object({})).handler(({ context }) => {
    context.resHeaders?.append(
      "Set-Cookie",
      "selected-account=account-1; Path=/; HttpOnly"
    );
    return { selected: true };
  }),
  forbidden: procedureWithErrors.input(z.object({})).handler(() => {
    throw new ORPCError("FORBIDDEN", {
      data: { message: "Admin access required" },
    });
  }),
  defect: testProcedure.input(z.object({})).handler(() => {
    throw new Error("private database diagnostic");
  }),
  health: testProcedure
    .route({ method: "GET", path: "/health" })
    .input(z.object({}))
    .output(z.object({ status: z.literal("ok") }))
    .handler(() => ({ status: "ok" as const })),
  timestamp: testProcedure
    .input(z.object({}))
    .output(z.object({ recordedAt: z.date() }))
    .handler(() => ({ recordedAt })),
};

const rpcRequest = (path: string, requestId?: string) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (requestId !== undefined) {
    headers.set("x-request-id", requestId);
  }
  return new Request(`http://localhost/api/rpc/${path}`, {
    body: JSON.stringify({ json: {} }),
    headers,
    method: "POST",
  });
};

const createTestApp = (authHandler: TestAuthHandler) =>
  createServerApp({
    authHandler,
    corsOrigin: allowedOrigin,
    enableRequestLogging: false,
    log: { error: vi.fn<TestErrorLogger>() },
    router: testRouter,
  });

describe(createServerApp, () => {
  it("composes the production router for both API transports", async () => {
    const { default: productionApp } = await import("./index");

    const rpcResponse = await productionApp.request(rpcRequest("health"));
    const referenceResponse = await productionApp.request(
      "/api/reference/health"
    );

    expect([rpcResponse.status, referenceResponse.status]).toStrictEqual([
      200, 200,
    ]);
    await expect(rpcResponse.json()).resolves.toStrictEqual({
      json: { status: "ok" },
    });
    await expect(referenceResponse.json()).resolves.toStrictEqual({
      status: "ok",
    });
    expect(
      [rpcResponse, referenceResponse].map((response) =>
        response.headers.get("cache-control")
      )
    ).toStrictEqual([privateNoStore, privateNoStore]);
  });

  it("serves the transport health endpoints", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const rootResponse = await app.request("/");
    const healthResponse = await app.request("/health");
    const rpcHealthResponse = await app.request(rpcRequest("health"));

    expect([
      rootResponse.status,
      healthResponse.status,
      rpcHealthResponse.status,
    ]).toStrictEqual([200, 200, 200]);
    await expect(rootResponse.text()).resolves.toBe("OK");
    await expect(healthResponse.json()).resolves.toStrictEqual({
      status: "ok",
    });
    await expect(rpcHealthResponse.json()).resolves.toStrictEqual({
      json: { status: "ok" },
    });
  });

  it("preserves native Date metadata through the RPC transport", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const response = await app.request(rpcRequest("timestamp"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      json: { recordedAt: recordedAt.toISOString() },
      meta: [[1, "recordedAt"]],
    });
  });

  it("serializes declared errors without leaking internal details", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const response = await app.request(rpcRequest("forbidden"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toStrictEqual({
      json: {
        code: "FORBIDDEN",
        data: { message: "Admin access required" },
        defined: true,
        message: "Forbidden",
        status: 403,
      },
    });
  });

  it("keeps unexpected defects out of the HTTP response", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const response = await app.request(rpcRequest("defect"));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL_SERVER_ERROR");
    expect(body).not.toContain("private database diagnostic");
    expect(response.headers.get("cache-control")).toBe(privateNoStore);
  });

  it("logs the request ID and path for an unexpected RPC failure", async () => {
    const log = { error: vi.fn<TestErrorLogger>() };
    const app = createServerApp({
      authHandler: () => new Response(null, { status: 501 }),
      corsOrigin: allowedOrigin,
      enableRequestLogging: false,
      log,
      router: testRouter,
    });

    await app.request(rpcRequest("defect", "request-123"));

    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-123",
        path: "/api/rpc/defect",
        method: "POST",
      }),
      "oRPC request failed"
    );
  });

  it.each(["/api/rpc/missing", "/api/reference/missing"])(
    "returns a JSON 404 for an unmatched handler at %s",
    async (path) => {
      const app = createTestApp(() => new Response(null, { status: 501 }));

      const response = await app.request(path);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toStrictEqual({
        error: "Not found",
      });
    }
  );

  it("sets private no-store on successful, error, and unmatched API responses", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const responses = await Promise.all([
      app.request(rpcRequest("health")),
      app.request(rpcRequest("forbidden")),
      app.request("/api/reference/health"),
      app.request("/api/reference/missing"),
      app.request(rpcRequest("cookie")),
    ]);

    expect(responses.map((response) => response.status)).toStrictEqual([
      200, 403, 200, 404, 200,
    ]);
    expect(
      responses.map((response) => response.headers.get("cache-control"))
    ).toStrictEqual(
      Array.from({ length: responses.length }, () => privateNoStore)
    );
    expect(responses.at(-1)?.headers.get("set-cookie")).toBe(
      "selected-account=account-1; Path=/; HttpOnly"
    );
  });

  it("answers credentialed CORS preflight requests", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const response = await app.request("/api/rpc/health", {
      headers: {
        "Access-Control-Request-Headers": "content-type,authorization",
        "Access-Control-Request-Method": "GET",
        Origin: allowedOrigin,
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      allowedOrigin
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true"
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "GET"
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type,Authorization"
    );
  });

  it("passes Better Auth requests and responses through unchanged", async () => {
    const authHandler = vi.fn<(request: Request) => Promise<Response>>(
      async (request) => {
        expect(request.method).toBe("POST");
        expect(new URL(request.url).pathname).toBe("/api/auth/sign-in");
        expect(request.headers.get("x-auth-test")).toBe("request-header");
        await expect(request.json()).resolves.toStrictEqual({
          provider: "test",
        });

        return Response.json(
          { authenticated: true },
          {
            headers: {
              "set-cookie": "session=test; Path=/; HttpOnly",
              "x-auth-test": "response-header",
            },
            status: 201,
          }
        );
      }
    );
    const app = createServerApp({
      authHandler,
      corsOrigin: allowedOrigin,
      enableRequestLogging: false,
      log: { error: vi.fn<TestErrorLogger>() },
      router: testRouter,
    });

    const response = await app.request("/api/auth/sign-in", {
      body: JSON.stringify({ provider: "test" }),
      headers: {
        "content-type": "application/json",
        "x-auth-test": "request-header",
      },
      method: "POST",
    });

    expect(authHandler).toHaveBeenCalledOnce();
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBe(
      "session=test; Path=/; HttpOnly"
    );
    expect(response.headers.get("x-auth-test")).toBe("response-header");
    await expect(response.json()).resolves.toStrictEqual({
      authenticated: true,
    });
  });
});
