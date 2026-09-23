import { describe, expect, it, vi } from "vitest";

import { createServerRpcClient } from "./api";

const createFixture = (authenticated: boolean) => {
  const privateApiFetch = vi
    .fn<(url: string, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(Response.json({ json: { authenticated } }));
  const client = createServerRpcClient({
    incomingHeaders: new Headers({
      cookie: "__Secure-better-auth.session_token=expired.invalid",
      host: "pcobooster.com",
      "x-forwarded-host": "untrusted.example",
      "x-forwarded-proto": "http",
    }),
    productOrigin: "https://pcobooster.com",
    api: { fetch: privateApiFetch },
  });
  return { client, privateApiFetch };
};

describe("server session lookup on Workers", () => {
  it("treats stale cookies as signed out through the private API at the configured origin", async () => {
    const { client, privateApiFetch } = createFixture(false);
    await expect(client.session.status({})).resolves.toStrictEqual({
      authenticated: false,
    });
    expect(privateApiFetch).toHaveBeenCalledOnce();
    const [url, init] = privateApiFetch.mock.calls[0] ?? [];
    expect(url).toBe("https://pcobooster.com/api/rpc/session/status");
    expect(new Headers(init?.headers).get("cookie")).toBe(
      "__Secure-better-auth.session_token=expired.invalid"
    );
    expect({
      cache: init?.cache,
      hasSignal: init?.signal instanceof AbortSignal,
    }).toStrictEqual({
      cache: "no-store",
      hasSignal: true,
    });
  });

  it("preserves the POST payload across the binding", async () => {
    const { client, privateApiFetch } = createFixture(false);
    await client.session.status({});
    const [url, init] = privateApiFetch.mock.calls[0] ?? [];
    const request = new Request(url ?? "https://invalid.example", init);
    expect(request.method).toBe("POST");
    await expect(request.json()).resolves.toStrictEqual({ json: {} });
  });

  it("returns the authenticated result from the private API", async () => {
    const { client, privateApiFetch } = createFixture(true);
    await expect(client.session.status({})).resolves.toStrictEqual({
      authenticated: true,
    });
    expect(privateApiFetch).toHaveBeenCalledOnce();
  });
});
