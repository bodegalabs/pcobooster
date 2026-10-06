import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import { describe, expect, it, vi } from "vitest";

import { makeHttpApp } from "./http-app";
import { serveHttpForTest } from "./test-http";

const allowedOrigin = "https://pcobooster.com";
const server = testServer({
  config: testServerConfig({ BETTER_AUTH_URL: allowedOrigin }),
});
type TestAuthHandler = (request: Request) => Promise<Response> | Response;

const createTestApp = (authHandler: TestAuthHandler) =>
  serveHttpForTest({ authHandler, server });

describe(makeHttpApp, () => {
  it("serves liveness at / and /health", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const rootResponse = await app.request("/");
    const healthResponse = await app.request("/health");

    expect([rootResponse.status, healthResponse.status]).toStrictEqual([
      200, 200,
    ]);
    await expect(rootResponse.text()).resolves.toBe("OK");
    await expect(healthResponse.json()).resolves.toStrictEqual({
      status: "ok",
    });
  });

  it("no longer serves per-procedure RPC paths or the OpenAPI reference", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const responses = await Promise.all([
      app.request("/api/rpc/health", { method: "POST" }),
      app.request("/api/reference"),
    ]);

    expect(responses.map((response) => response.status)).toStrictEqual([
      404, 404,
    ]);
  });

  it("answers credentialed CORS preflight requests, allowing every header the clients send", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const response = await app.request("/api/rpc", {
      headers: {
        "Access-Control-Request-Headers":
          "content-type,authorization,x-pcobooster-client,x-pcobooster-priority",
        "Access-Control-Request-Method": "POST",
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
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type,Authorization,x-pcobooster-client,x-request-id,x-pcobooster-account,x-pcobooster-demo,x-pcobooster-priority"
    );
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
  });

  it("answers a preflight from another origin without allowing it", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));

    const response = await app.request("/api/v1/plan-people/pp-1", {
      headers: {
        "Access-Control-Request-Method": "PATCH",
        Origin: "https://evil.example",
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("puts CORS and the cache policy on every answer, errors and unknown paths included", async () => {
    const app = createTestApp(() => new Response(null, { status: 501 }));
    const headers = { Origin: allowedOrigin };

    const responses = await Promise.all([
      app.request("/health", { headers }),
      app.request("/api/v1/nothing-here", { headers }),
      app.request("/api/auth/get-session", { headers }),
    ]);

    expect(
      responses.map((response) => [
        response.status,
        response.headers.get("access-control-allow-origin"),
        response.headers.get("access-control-allow-credentials"),
        response.headers.get("vary"),
        response.headers.get("cache-control"),
        response.headers.get("x-pcobooster-version"),
      ])
    ).toStrictEqual(
      [200, 404, 501].map((status) => [
        status,
        allowedOrigin,
        "true",
        "Origin",
        "private, no-store",
        "http-app-test",
      ])
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
    const app = serveHttpForTest({ authHandler, server });

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

  it("rejects auth writes from a client over its rate limit", async () => {
    const authHandler = vi.fn<TestAuthHandler>(() => new Response("signed in"));
    const allowAuthWrite = vi.fn<(clientIp: string) => Promise<boolean>>(
      async () => await Promise.resolve(false)
    );
    const app = serveHttpForTest({ allowAuthWrite, authHandler, server });

    const response = await app.request("/api/auth/sign-in/social", {
      headers: { "cf-connecting-ip": "203.0.113.7" },
      method: "POST",
    });

    expect(allowAuthWrite).toHaveBeenCalledExactlyOnceWith("203.0.113.7");
    expect(authHandler).not.toHaveBeenCalled();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("counts the native sign-in start and exchange against the auth limit", async () => {
    const authHandler = vi.fn<TestAuthHandler>(() => new Response("ok"));
    const allowAuthWrite = vi.fn<(clientIp: string) => Promise<boolean>>(
      async () => await Promise.resolve(false)
    );
    const app = serveHttpForTest({ allowAuthWrite, authHandler, server });
    const headers = { "cf-connecting-ip": "203.0.113.7" };

    const start = await app.request(
      "/api/auth/native/start?redirect_uri=pcobooster%3A%2F%2Fauth%2Fcallback",
      { headers }
    );
    const exchange = await app.request("/api/auth/native/exchange", {
      headers,
      method: "POST",
    });
    const callback = await app.request(
      "/api/auth/callback/planning-center?code=c&state=s",
      { headers }
    );

    expect([start.status, exchange.status, callback.status]).toStrictEqual([
      429, 429, 200,
    ]);
    expect(allowAuthWrite).toHaveBeenCalledTimes(2);
    expect(authHandler).toHaveBeenCalledOnce();
  });

  it("never rate limits session reads or requests without a client IP", async () => {
    const authHandler = vi.fn<TestAuthHandler>(() => new Response("ok"));
    const allowAuthWrite = vi.fn<(clientIp: string) => Promise<boolean>>(
      async () => await Promise.resolve(false)
    );
    const app = serveHttpForTest({ allowAuthWrite, authHandler, server });

    const sessionRead = await app.request("/api/auth/get-session", {
      headers: { "cf-connecting-ip": "203.0.113.7" },
    });
    const anonymousWrite = await app.request("/api/auth/sign-out", {
      method: "POST",
    });

    expect(allowAuthWrite).not.toHaveBeenCalled();
    expect([sessionRead.status, anonymousWrite.status]).toStrictEqual([
      200, 200,
    ]);
  });
});
