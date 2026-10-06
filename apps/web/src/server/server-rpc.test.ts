import type {
  JsonObject,
  JsonValue,
} from "@pcobooster/planning-center-models/json";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { serverCall } from "./server-rpc";
import type { ServiceFetcher } from "./server-rpc";

const productOrigin = "https://pcobooster.com";
const staleCookie = "__Secure-better-auth.session_token=expired.invalid";

interface RpcRequestBody {
  readonly id: JsonValue;
  readonly tag: string;
  readonly payload: JsonValue;
  readonly headers: readonly (readonly [string, string])[];
}

const isRpcRequestBody = (value: unknown): value is RpcRequestBody =>
  typeof value === "object" && value !== null && "id" in value;

const readBody = async (request: Request): Promise<RpcRequestBody> => {
  const body: unknown = await request.clone().json();
  if (!isRpcRequestBody(body)) {
    throw new Error("Not an RPC request");
  }
  return body;
};

/** Answers each call through the binding with `exit`, as the API's RPC route does. */
const createFixture = (exit: () => JsonObject, status = 200) => {
  const requests: Request[] = [];
  const api: ServiceFetcher = {
    fetch: async (request) => {
      requests.push(request);
      const { id } = await readBody(request);
      return Response.json([{ _tag: "Exit", requestId: id, exit: exit() }], {
        status,
      });
    },
  };
  return { api, requests };
};

const success = (value: JsonObject) => (): JsonObject => ({
  _tag: "Success",
  value,
});
const failure = (fault: JsonObject) => (): JsonObject => ({
  _tag: "Failure",
  cause: [{ _tag: "Fail", error: fault }],
});

const sessionStatus = async (api: ServiceFetcher, cookie = staleCookie) =>
  await serverCall({ api, cookie, productOrigin }, "session.status", {});

describe(serverCall, () => {
  it("reads the session through the private API at the configured origin, forwarding the cookie as an HTTP header", async () => {
    const { api, requests } = createFixture(success({ authenticated: false }));

    await expect(sessionStatus(api)).resolves.toStrictEqual({
      authenticated: false,
    });
    const [request] = requests;
    const body = request === undefined ? undefined : await readBody(request);

    expect({
      count: requests.length,
      url: request?.url,
      method: request?.method,
      redirect: request?.redirect,
      cookie: request?.headers.get("cookie"),
      client: request?.headers.get("x-pcobooster-client"),
      tag: body?.tag,
      payload: body?.payload,
      messageHeaders: body?.headers.map(([name]) => name),
    }).toStrictEqual({
      count: 1,
      url: "https://pcobooster.com/api/rpc/",
      method: "POST",
      redirect: "manual",
      cookie: staleCookie,
      client: "ssr;rpc=1",
      tag: "session.status",
      payload: {},
      messageHeaders: ["x-pcobooster-priority"],
    });
  });

  it("sends no cookie header when the request has none", async () => {
    const { api, requests } = createFixture(success({ authenticated: false }));
    await serverCall(
      { api, cookie: undefined, productOrigin },
      "session.status",
      {}
    );
    expect(requests[0]?.headers.get("cookie")).toBeNull();
  });

  it("sends signed-out requests to sign-in", async () => {
    const { api } = createFixture(
      failure({ _tag: "Unauthenticated", message: "Sign in" }),
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
    const { api } = createFixture(failure(error), status);
    await expect(sessionStatus(api)).rejects.toSatisfy(isNotFound);
  });

  it("rejects with other faults unchanged", async () => {
    const { api } = createFixture(
      failure({ _tag: "InternalError", message: "Internal server error" }),
      500
    );
    await expect(sessionStatus(api)).rejects.toMatchObject({
      _tag: "InternalError",
    });
  });
});
