import type { JsonObject } from "@pcobooster/planning-center-models/json";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { serverCall } from "./server-api";
import type { ServiceFetcher } from "./server-api";

const productOrigin = "https://pcobooster.com";
const staleCookie = "__Secure-better-auth.session_token=expired.invalid";

/** Answers each call through the binding with `body` and `status`, as the API does. */
const createFixture = (body: JsonObject, status = 200) => {
  const requests: Request[] = [];
  const api: ServiceFetcher = {
    fetch: async (request) => {
      requests.push(request);
      return await Promise.resolve(Response.json(body, { status }));
    },
  };
  return { api, requests };
};

const sessionStatus = async (api: ServiceFetcher, cookie = staleCookie) =>
  await serverCall({ api, cookie, productOrigin }, (client) =>
    client.session.status()
  );

describe(serverCall, () => {
  it("reads the session through the private API at the configured origin, forwarding the cookie as an HTTP header", async () => {
    const { api, requests } = createFixture({ authenticated: false });

    await expect(sessionStatus(api)).resolves.toStrictEqual({
      authenticated: false,
    });
    const [request] = requests;

    expect({
      count: requests.length,
      url: request?.url,
      method: request?.method,
      redirect: request?.redirect,
      cookie: request?.headers.get("cookie"),
      client: request?.headers.get("x-pcobooster-client"),
      priority: request?.headers.get("x-pcobooster-priority"),
    }).toStrictEqual({
      count: 1,
      url: "https://pcobooster.com/api/v1/session",
      method: "GET",
      redirect: "manual",
      cookie: staleCookie,
      client: "ssr;api=2",
      priority: "interactive",
    });
  });

  it("sends no cookie header when the request has none", async () => {
    const { api, requests } = createFixture({ authenticated: false });
    await serverCall({ api, cookie: undefined, productOrigin }, (client) =>
      client.session.status()
    );
    expect(requests[0]?.headers.get("cookie")).toBeNull();
  });

  it("sends signed-out requests to sign-in", async () => {
    const { api } = createFixture(
      { _tag: "Unauthenticated", message: "Sign in" },
      401
    );
    await expect(sessionStatus(api)).rejects.toSatisfy(
      (error) => isRedirect(error) && error.options.to === "/auth"
    );
  });

  it.each([
    ["Forbidden", { _tag: "Forbidden", message: "No access" }, 403],
    [
      "NotFound",
      { _tag: "NotFound", message: "No plan", resource: "plan" },
      404,
    ],
  ])("renders not-found for %s", async (_name, error, status) => {
    const { api } = createFixture(error, status);
    await expect(sessionStatus(api)).rejects.toSatisfy(isNotFound);
  });

  it("rejects with other faults unchanged", async () => {
    const { api } = createFixture(
      { _tag: "InternalError", message: "Internal server error" },
      500
    );
    await expect(sessionStatus(api)).rejects.toMatchObject({
      _tag: "InternalError",
    });
  });
});
