/**
 * The product API's HTTP surface through the Worker's router: liveness through the whole API,
 * the client version gate, CORS on product answers, bodies HttpApi cannot read, unknown and
 * misrouted requests, and the cookies procedures set.
 */
import type { RequestAuthentication } from "@pcobooster/api/application/planning-center-access";
import { demoSessionToken } from "@pcobooster/api/auth/demo-access";
import {
  createPlanningCenterReadCaches,
  createPlanningCenterServices,
} from "@pcobooster/api/planning-center/services/factory";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import { makeProductClient } from "@pcobooster/client/product-client";
import { ClientOutdated } from "@pcobooster/contracts/faults/client-outdated";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { SERVER_VERSION_HEADER } from "@pcobooster/contracts/http/client-version";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { serveHttpForTest, TEST_API_ORIGIN } from "./test-http";

const privateNoStore = "private, no-store";

/** One raw request from a current web client, unless `headers` says otherwise. */
const raw = (
  method: string,
  path: string,
  {
    body,
    headers = {},
  }: { body?: string; headers?: Record<string, string> } = {}
) =>
  new Request(`${TEST_API_ORIGIN}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-pcobooster-client": "web;api=2",
      ...headers,
    },
    body,
  });

const outcomeLines = (app: ReturnType<typeof serveHttpForTest>) =>
  app.logs
    .filter((line) => line.message === "rpc")
    .map(({ level, fields }) => ({
      level,
      procedure: fields.procedure,
      status: fields.status,
      code: fields.code,
      client: fields.client,
    }));

describe("health through the product API", () => {
  it("answers privately, with the release version, to a client that names itself", async () => {
    const app = serveHttpForTest({ server: testServer() });
    const client = app.client({ client: "deploy" });

    await expect(client.run((api) => api.health.get())).resolves.toStrictEqual({
      status: "ok",
      version: "development",
    });
    const response = await app.fetch(raw("GET", "/api/v1/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(privateNoStore);
    expect(response.headers.get(SERVER_VERSION_HEADER)).toBe("development");
    expect(outcomeLines(app)).toStrictEqual([
      {
        level: "info",
        procedure: "health.get",
        status: 200,
        code: null,
        client: "deploy;api=2",
      },
      {
        level: "info",
        procedure: "health.get",
        status: 200,
        code: null,
        client: "web;api=2",
      },
    ]);
  });

  it("answers ClientOutdated (426) to a caller that does not name itself", async () => {
    const app = serveHttpForTest({ server: testServer() });

    const response = await app.fetch(
      new Request(`${TEST_API_ORIGIN}/api/v1/health`)
    );

    expect(response.status).toBe(426);
    expect(outcomeLines(app)).toStrictEqual([
      {
        level: "info",
        procedure: "health.get",
        status: 426,
        code: "CLIENT_OUTDATED",
        client: null,
      },
    ]);
  });

  it.each(["expo;api=0", "expo;api=1", "expo", "android;api=1", "expo;v=1"])(
    "answers ClientOutdated (426) to a caller announcing %s, without running the procedure",
    async (header) => {
      const app = serveHttpForTest({ server: testServer() });
      const client = makeProductClient({
        url: TEST_API_ORIGIN,
        client: "expo",
        // Simulate an old binary after its transport has added that binary's version header.
        fetch: async (input, init) => {
          const request = new Request(input, init);
          request.headers.set("x-pcobooster-client", header);
          return await app.fetch(request);
        },
      });

      await expect(
        client.run((api) => api.health.get())
      ).rejects.toBeInstanceOf(ClientOutdated);
      const response = await app.fetch(
        raw("GET", "/api/v1/health", {
          headers: { "x-pcobooster-client": header },
        })
      );

      expect(response.status).toBe(426);
      expect(response.headers.get("cache-control")).toBe(privateNoStore);
      expect(outcomeLines(app).at(-1)).toStrictEqual({
        level: "info",
        procedure: "health.get",
        status: 426,
        code: "CLIENT_OUTDATED",
        client: header,
      });
    }
  );
});

const corsHeaders = (response: Response) => ({
  status: response.status,
  allowOrigin: response.headers.get("access-control-allow-origin"),
  allowCredentials: response.headers.get("access-control-allow-credentials"),
  vary: response.headers.get("vary"),
});

describe("CORS on product answers", () => {
  const productOrigin = "https://pcobooster.com";
  const corsServer = testServer({
    config: testServerConfig({ BETTER_AUTH_URL: productOrigin }),
  });

  it("allows the product origin with credentials, on answers and on wrong methods", async () => {
    const app = serveHttpForTest({ server: corsServer });

    const answered = await app.fetch(
      raw("GET", "/api/v1/health", { headers: { origin: productOrigin } })
    );
    const refused = await app.fetch(
      raw("POST", "/api/v1/health", { headers: { origin: productOrigin } })
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
    const app = serveHttpForTest({ server: corsServer });

    const response = await app.fetch(
      raw("GET", "/api/v1/health", {
        headers: { origin: "https://elsewhere.example" },
      })
    );

    expect(corsHeaders(response)).toStrictEqual({
      status: 200,
      allowOrigin: null,
      allowCredentials: "true",
      vary: "Origin",
    });
  });
});

const account: RequestAuthentication = {
  kind: "account",
  userId: "user-1",
  accessToken: "routes-test-token",
  accountId: "account-1",
  account: { id: "account-1", accountId: "provider-account-1" },
  scopes: ["services"],
};

/** A signed-in router whose run sheet answers one item list and records reorders. */
const runSheet = () => {
  const services = createPlanningCenterServices(
    "routes-test-token",
    "America/Los_Angeles",
    unreachableHttpClient,
    createPlanningCenterReadCaches(null)
  );
  const reorder = vi
    .spyOn(services.planItems, "reorderPlanItems")
    .mockReturnValue(Effect.void);
  const update = vi.spyOn(services.planItems, "updatePlanItem");
  const app = serveHttpForTest({
    server: testServer(),
    access: {
      authorize: async () => await Promise.resolve(account),
      createServices: () => services,
      presentationMode: () => false,
      presentationSeed: "seed",
    },
  });
  return { app, reorder, update };
};

const ITEMS = "/api/v1/service-types/st-1/plans/plan-1/items";

describe("requests HttpApi cannot read", () => {
  it.each([
    ["a body that is not JSON", "{not json", {}, "invalid-payload"],
    [
      "a body sent as text, not JSON",
      "sequence=a",
      { "content-type": "text/plain" },
      "malformed-request",
    ],
    [
      "a body of the wrong shape",
      JSON.stringify({ sequence: "a" }),
      {},
      "invalid-payload",
    ],
  ])(
    "answers %s with a sanitized 400 RequestRejected and logs it",
    async (_case, body, headers, reason) => {
      const { app, reorder } = runSheet();

      const response = await app.fetch(
        raw("PUT", `${ITEMS}/order`, { body, headers })
      );
      const answer: unknown = await response.json();

      expect({
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        body: answer,
        lines: outcomeLines(app),
      }).toStrictEqual({
        status: 400,
        cacheControl: privateNoStore,
        body: {
          _tag: "RequestRejected",
          message:
            "This version of pcobooster is out of date. Reload or update it to continue.",
          reason,
        },
        lines: [
          {
            level: "info",
            procedure: "planItems.reorder",
            status: 400,
            code: "BAD_REQUEST",
            client: "web;api=2",
          },
        ],
      });
      expect(reorder).not.toHaveBeenCalled();
    }
  );
});

describe("requests that match no endpoint", () => {
  it("routes PUT .../items/order to the reorder, never to an item id", async () => {
    const { app, reorder, update } = runSheet();

    const response = await app.fetch(
      raw("PUT", `${ITEMS}/order`, {
        body: JSON.stringify({ sequence: ["item-2", "item-1"] }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ success: true });
    expect(reorder).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(outcomeLines(app).map(({ procedure }) => procedure)).toStrictEqual([
      "planItems.reorder",
    ]);
  });

  it("answers a known path's other methods 405 with Allow, logged without a procedure", async () => {
    const { app } = runSheet();

    const response = await app.fetch(raw("POST", `${ITEMS}/item-1`));

    expect([response.status, response.headers.get("allow")]).toStrictEqual([
      405,
      "PATCH, DELETE",
    ]);
    expect(
      app.logs
        .filter((line) => line.message === "rpc")
        .map(({ fields }) => [
          fields.procedure,
          fields.method,
          fields.route,
          fields.status,
          fields.code,
        ])
    ).toStrictEqual([
      [
        null,
        "POST",
        "/api/v1/service-types/:serviceTypeId/plans/:planId/items/:itemId",
        405,
        "METHOD_NOT_ALLOWED",
      ],
    ]);
  });

  it.each(["/api/v1", "/api/v1/plan-people/%E0%A4"])(
    "rejects a router miss at %s with a readable fault and an outcome",
    async (path) => {
      const app = serveHttpForTest({ server: testServer() });
      const reply = await app.fetch(raw("GET", path));
      expect(reply.status).toBe(400);
      await expect(reply.json()).resolves.toMatchObject({
        _tag: "RequestRejected",
        reason: "unknown-endpoint",
      });
      expect(outcomeLines(app)).toMatchObject([{ status: 400 }]);
      expect(reply.headers.get("cache-control")).toBe(privateNoStore);
    }
  );

  it("decodes a wrong-method response as RequestRejected with Allow", async () => {
    const app = serveHttpForTest({ server: testServer() });
    const client = makeProductClient({
      url: TEST_API_ORIGIN,
      client: "web",
      fetch: async (input, init) =>
        await app.fetch(
          new Request(input, { ...init, method: "GET", body: undefined })
        ),
    });
    await expect(
      client.run((api) =>
        api.schedule.updateStatus({
          params: { planPersonId: "1" },
          payload: { status: "C" },
        })
      )
    ).rejects.toMatchObject({ _tag: "RequestRejected" });
  });

  it("answers an unknown /api/v1 path RequestRejected (unknown-endpoint), never NotFound", async () => {
    const { app } = runSheet();

    const response = await app.fetch(raw("GET", "/api/v1/retired-endpoint"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      _tag: "RequestRejected",
      reason: "unknown-endpoint",
    });
  });

  it("answers an unknown path outside /api/v1 with an empty 404", async () => {
    const { app } = runSheet();

    const response = await app.fetch(raw("GET", "/no-such-route"));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe(privateNoStore);
    await expect(response.text()).resolves.toBe("");
  });
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
    const app = serveHttpForTest({ server: demoServer });
    const token =
      demoServer.config.demo === null
        ? ""
        : demoSessionToken(demoServer.config.demo);

    const start = await app.fetch(
      raw("POST", "/api/v1/demo/session", {
        body: JSON.stringify({
          key: " demo-link-key-long-enough-to-pass-0000 ",
        }),
      })
    );
    const exit = await app.fetch(raw("DELETE", "/api/v1/demo/session"));

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
    const app = serveHttpForTest({ server: demoServer });

    await expect(
      app.client().run((api) => api.demo.start({ payload: { key: "guessed" } }))
    ).rejects.toBeInstanceOf(NotFound);
    const response = await app.fetch(
      raw("POST", "/api/v1/demo/session", {
        body: JSON.stringify({ key: "guessed" }),
      })
    );

    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toStrictEqual([]);
  });

  it("marks cookies Secure outside plain-HTTP local development", async () => {
    const app = serveHttpForTest({
      server: testServer({
        config: testServerConfig({ NODE_ENV: "production" }),
      }),
    });

    const exit = await app.fetch(raw("DELETE", "/api/v1/demo/session"));

    expect(exit.headers.getSetCookie()).toStrictEqual([
      "pcobooster-demo=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
  });
});
