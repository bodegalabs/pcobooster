import { isNotFound, isRedirect } from "@tanstack/react-router";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { createServerRpcClient } from "./server-rpc";
import type { ServiceFetcher } from "./server-rpc";

const productOrigin = "https://pcobooster.com";

const createFixture = (
  response: (request: Request) => Promise<Response> | Response
) => {
  const requests: Request[] = [];
  const api: ServiceFetcher = {
    fetch: async (request) => {
      requests.push(request);
      return await Promise.resolve(response(request.clone()));
    },
  };
  const client = createServerRpcClient({
    api,
    cookie: "__Secure-better-auth.session_token=expired.invalid",
    productOrigin,
  });
  return { client, requests };
};

const status = (authenticated: boolean) => async (request: Request) => {
  const message: unknown = await request.json();
  const envelope = Schema.decodeUnknownSync(
    Schema.Struct({ id: Schema.Union([Schema.String, Schema.Number]) })
  )(message);
  return Response.json([
    {
      _tag: "Exit",
      requestId: envelope.id,
      exit: { _tag: "Success", value: { authenticated } },
    },
  ]);
};

describe("server session lookup on Workers", () => {
  it("treats stale cookies as signed out through the private API at the configured origin", async () => {
    const { client, requests } = createFixture(status(false));
    await expect(client.call("session.status", {})).resolves.toStrictEqual({
      authenticated: false,
    });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe("https://pcobooster.com/api/rpc/");
    expect(request?.headers.get("cookie")).toBe(
      "__Secure-better-auth.session_token=expired.invalid"
    );
    expect(request?.redirect).toBe("manual");
  });

  it("preserves the POST payload across the binding", async () => {
    const { client, requests } = createFixture(status(false));
    await client.call("session.status", {});
    const [request] = requests;
    expect(request?.method).toBe("POST");
    await expect(request?.json()).resolves.toMatchObject({
      _tag: "Request",
      tag: "session.status",
      payload: {},
    });
  });

  it("returns the authenticated result from the private API", async () => {
    const { client } = createFixture(status(true));
    await expect(client.call("session.status", {})).resolves.toStrictEqual({
      authenticated: true,
    });
  });

  it("sends no cookie header when the request has none", async () => {
    const requests: Request[] = [];
    const client = createServerRpcClient({
      api: {
        fetch: async (request) => {
          requests.push(request);
          return await status(false)(request.clone());
        },
      },
      cookie: undefined,
      productOrigin,
    });
    await client.call("session.status", {});
    expect(requests[0]?.headers.get("cookie")).toBeNull();
  });

  it("sends signed-out requests to sign-in", async () => {
    const { client } = createFixture(() => new Response(null, { status: 401 }));
    await expect(client.call("session.status", {})).rejects.toSatisfy(
      (error) => isRedirect(error) && error.options.to === "/auth"
    );
  });

  it.each([403, 404])("renders not-found for %i", async (code) => {
    const { client } = createFixture(
      () => new Response(null, { status: code })
    );
    await expect(client.call("session.status", {})).rejects.toSatisfy(
      isNotFound
    );
  });

  it("fails other API errors", async () => {
    const { client } = createFixture(() => new Response(null, { status: 500 }));
    await expect(client.call("session.status", {})).rejects.toThrow(
      "API request failed with status 500"
    );
  });
});
