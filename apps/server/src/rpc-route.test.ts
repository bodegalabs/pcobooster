import { demoSessionToken } from "@pcobooster/api/auth/demo-access";
import {
  demoSessionCookie,
  selectedAccountCookie,
} from "@pcobooster/api/rpc/response-cookies";
import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import { ClientOutdated } from "@pcobooster/contracts/faults/client-outdated";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import {
  RPC_HEADERS,
  SERVER_VERSION_HEADER,
} from "@pcobooster/contracts/rpc/procedure";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { describe, expect, it } from "vitest";

import { finishResponse } from "./rpc-route";
import {
  serveRpcForTest,
  TEST_RELEASE_VERSION,
  TEST_RPC_URL,
} from "./test-rpc";

const privateNoStore = "private, no-store";

/** One raw RPC request, as an old or hand-written client sends it. */
const rawRpc = (
  tag: string,
  payload: JsonValue,
  headers: Record<string, string> = {}
) =>
  new Request(TEST_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      _tag: "Request",
      id: "1",
      tag,
      payload,
      headers: [],
    }),
  });

const outcomeLines = (route: ReturnType<typeof serveRpcForTest>) =>
  route.logs
    .filter((line) => line.message === "rpc")
    .map(({ level, fields }) => ({
      level,
      procedure: fields.procedure,
      status: fields.status,
      code: fields.code,
      client: fields.client,
    }));

describe("the /api/rpc route", () => {
  it("answers health privately, with the release version, to a client that names itself", async () => {
    const route = serveRpcForTest({ server: testServer() });
    const client = route.client({ client: "deploy" });

    await expect(client.call("health", {})).resolves.toStrictEqual({
      status: "ok",
      version: "development",
    });
    const raw = await route.fetch(rawRpc("health", {}));

    expect(raw.status).toBe(200);
    expect(raw.headers.get("cache-control")).toBe(privateNoStore);
    expect(raw.headers.get(SERVER_VERSION_HEADER)).toBe(TEST_RELEASE_VERSION);
    expect(outcomeLines(route)).toStrictEqual([
      {
        level: "info",
        procedure: "health",
        status: 200,
        code: null,
        client: "deploy;rpc=1",
      },
      {
        level: "info",
        procedure: "health",
        status: 200,
        code: null,
        client: null,
      },
    ]);
  });

  it.each(["expo;rpc=0", "expo", "android;rpc=1"])(
    "answers ClientOutdated (426) to a caller announcing %s, without running the procedure",
    async (header) => {
      const route = serveRpcForTest({ server: testServer() });
      const client = route.client({ client: "expo" });

      await expect(
        client.call(
          "health",
          {},
          { httpHeaders: { [RPC_HEADERS.client]: header } }
        )
      ).rejects.toBeInstanceOf(ClientOutdated);
      const raw = await route.fetch(
        rawRpc("health", {}, { [RPC_HEADERS.client]: header })
      );

      expect(raw.status).toBe(426);
      expect(raw.headers.get("cache-control")).toBe(privateNoStore);
      expect(outcomeLines(route).at(-1)).toStrictEqual({
        level: "info",
        procedure: "health",
        status: 426,
        code: "CLIENT_OUTDATED",
        client: header,
      });
    }
  );
});

/** A POST to the route with this exact body, from a current web client. */
const rawBody = (body: string) =>
  new Request(TEST_RPC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [RPC_HEADERS.client]: "web;rpc=1",
    },
    body,
  });

const malformedDefect = {
  _tag: "Defect",
  defect: "The request is not a valid RPC request.",
};

const rejectedExit = (requestId: string) => ({
  _tag: "Exit",
  requestId,
  exit: {
    _tag: "Failure",
    cause: [
      {
        _tag: "Fail",
        error: {
          _tag: "RequestRejected",
          message:
            "This version of pcobooster is out of date. Reload or update it to continue.",
          reason: "malformed-request",
        },
      },
    ],
  },
});

const corsHeaders = (response: Response) => ({
  status: response.status,
  allowOrigin: response.headers.get("access-control-allow-origin"),
  allowCredentials: response.headers.get("access-control-allow-credentials"),
  vary: response.headers.get("vary"),
});

describe("CORS on RPC responses", () => {
  const productOrigin = "https://pcobooster.com";
  const corsServer = testServer({
    config: testServerConfig({ BETTER_AUTH_URL: productOrigin }),
  });

  it("allows the product origin with credentials, as every other API response does", async () => {
    const route = serveRpcForTest({ server: corsServer });

    const answered = await route.fetch(
      rawRpc("health", {}, { origin: productOrigin })
    );
    const refused = await route.fetch(
      new Request(TEST_RPC_URL, {
        method: "GET",
        headers: { origin: productOrigin },
      })
    );

    expect([corsHeaders(answered), corsHeaders(refused)]).toStrictEqual([
      {
        status: 200,
        allowOrigin: productOrigin,
        allowCredentials: "true",
        vary: "Origin",
      },
      {
        status: 405,
        allowOrigin: productOrigin,
        allowCredentials: "true",
        vary: "Origin",
      },
    ]);
  });

  it("names no allowed origin to any other site", async () => {
    const route = serveRpcForTest({ server: corsServer });

    const response = await route.fetch(
      rawRpc("health", {}, { origin: "https://elsewhere.example" })
    );

    expect(corsHeaders(response)).toStrictEqual({
      status: 200,
      allowOrigin: null,
      allowCredentials: "true",
      vary: "Origin",
    });
  });
});

describe("malformed RPC bodies", () => {
  it.each([
    {
      case: "a request id that is neither a string nor a number",
      body: JSON.stringify({
        _tag: "Request",
        id: {},
        tag: "health",
        payload: {},
        headers: [],
      }),
      answer: [malformedDefect],
      procedure: "health",
    },
    {
      case: "a body that is not JSON",
      body: "{not json",
      answer: [malformedDefect],
      procedure: "",
    },
    {
      case: "a request without message headers",
      body: JSON.stringify({
        _tag: "Request",
        id: "1",
        tag: "health",
        payload: {},
      }),
      answer: [rejectedExit("1")],
      procedure: "health",
    },
    {
      case: "a message that is not a request",
      body: JSON.stringify({ _tag: "Bogus" }),
      answer: [malformedDefect],
      procedure: "",
    },
    {
      case: "an empty batch",
      body: "[]",
      answer: [malformedDefect],
      procedure: "",
    },
  ])(
    "answers $case with a sanitized 400 and logs it",
    async ({ body, answer, procedure }) => {
      const route = serveRpcForTest({ server: testServer() });

      const raw = await route.fetch(rawBody(body));
      const answered: unknown = JSON.parse(await raw.text());

      expect({
        status: raw.status,
        cacheControl: raw.headers.get("cache-control"),
        body: answered,
        lines: outcomeLines(route),
      }).toStrictEqual({
        status: 400,
        cacheControl: privateNoStore,
        body: answer,
        lines: [
          {
            level: "info",
            procedure,
            status: 400,
            code: "BAD_REQUEST",
            client: "web;rpc=1",
          },
        ],
      });
    }
  );
});

describe("cookies set by procedures", () => {
  const demoServer = testServer({
    config: testServerConfig({
      DEMO_ACCESS_KEY: "demo-link-key-long-enough-to-pass-0000",
      DEMO_PLANNING_CENTER_CLIENT: "demo-client",
      DEMO_PLANNING_CENTER_PAT: "demo-pat",
    }),
  });

  it("sets the demo session cookie when a demo starts and expires it on exit", async () => {
    const route = serveRpcForTest({ server: demoServer });
    const token =
      demoServer.config.demo === null
        ? ""
        : demoSessionToken(demoServer.config.demo);

    const start = await route.fetch(
      rawRpc("demo.start", { key: " demo-link-key-long-enough-to-pass-0000 " })
    );
    const exit = await route.fetch(rawRpc("demo.exit", {}));

    expect([start.status, exit.status]).toStrictEqual([200, 200]);
    expect(start.headers.getSetCookie()).toStrictEqual([
      `pcobooster-demo=${token}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`,
    ]);
    expect(exit.headers.getSetCookie()).toStrictEqual([
      "pcobooster-demo=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    ]);
    expect(
      [start, exit].map((response) => response.headers.get("cache-control"))
    ).toStrictEqual([privateNoStore, privateNoStore]);
  });

  it("sets no cookie for a demo key that is not active", async () => {
    const route = serveRpcForTest({ server: demoServer });

    await expect(
      route.client().call("demo.start", { key: "guessed" })
    ).rejects.toBeInstanceOf(NotFound);
    const raw = await route.fetch(rawRpc("demo.start", { key: "guessed" }));

    expect(raw.status).toBe(404);
    expect(raw.headers.getSetCookie()).toStrictEqual([]);
  });

  it("marks cookies Secure outside plain-HTTP local development", async () => {
    const route = serveRpcForTest({
      server: testServer({
        config: testServerConfig({ NODE_ENV: "production" }),
      }),
    });

    const exit = await route.fetch(rawRpc("demo.exit", {}));

    expect(exit.headers.getSetCookie()).toStrictEqual([
      "pcobooster-demo=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it("writes each cookie as its own Set-Cookie line beside the response's own", () => {
    const response = finishResponse(
      HttpServerResponse.empty().pipe(
        HttpServerResponse.setCookieUnsafe("existing", "value", { path: "/" })
      ),
      {
        outcomes: [],
        cookies: [
          selectedAccountCookie("account / one", true),
          demoSessionCookie(null, true),
        ],
      },
      TEST_RELEASE_VERSION
    );

    expect(
      HttpServerResponse.toWeb(response).headers.getSetCookie()
    ).toStrictEqual([
      "existing=value; Path=/",
      "pco-selected-account-id=account%20%2F%20one; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax",
      "pcobooster-demo=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
  });
});
