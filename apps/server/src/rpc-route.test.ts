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
