import { testServer } from "@pcobooster/api/testing/server";
import { ClientOutdated } from "@pcobooster/contracts/faults/client-outdated";
import {
  RPC_HEADERS,
  SERVER_VERSION_HEADER,
} from "@pcobooster/contracts/rpc/procedure";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import { describe, expect, it } from "vitest";

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
