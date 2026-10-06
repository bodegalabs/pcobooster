import {
  failureCode,
  failureMessage,
  failureStatus,
  makeProductClient,
  TransportFailure,
} from "@pcobooster/client/product-client";
import type { ProductClient } from "@pcobooster/client/product-client";
import { ClientOutdated } from "@pcobooster/contracts/faults/client-outdated";
import { Conflict } from "@pcobooster/contracts/faults/conflict";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const decodeRequestId = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ id: Schema.Union([Schema.String, Schema.Number]) })
  )
);

/** A client whose every call is answered by `respond` with the request's id, recording it. */
const clientAnswering = (respond: (requestId: string | number) => Response) => {
  const sent: Request[] = [];
  const client = makeProductClient({
    url: "https://api.example/api/rpc",
    client: "web",
    credentials: "include",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      sent.push(request);
      return respond(decodeRequestId(await request.clone().text()).id);
    },
  });
  return { client, sent };
};

/** Never called: it only has to compile, with the expected error. */
const speculativeWrite = async (typed: ProductClient) =>
  await typed.call(
    "schedule.remove",
    { planPersonId: "1", serviceTypeId: "2", planId: "3" },
    // @ts-expect-error A write always goes out interactive.
    { priority: "speculative" }
  );

describe(makeProductClient, () => {
  it("rejects with the fault class the server answered with", async () => {
    const { client, sent } = clientAnswering((requestId) =>
      Response.json([
        {
          _tag: "Exit",
          requestId,
          exit: {
            _tag: "Failure",
            cause: [
              {
                _tag: "Fail",
                error: {
                  _tag: "NotFound",
                  message: "No plan",
                  resource: "plan",
                },
              },
            ],
          },
        },
      ])
    );

    await expect(
      client.call("catalog.plan", { serviceTypeId: "1", planId: "2" })
    ).rejects.toBeInstanceOf(NotFound);
    expect(
      sent.map((request) => request.headers.get("x-pcobooster-client"))
    ).toStrictEqual(["web;rpc=1"]);
    await client.dispose();
  });

  it("reports a response that is not RPC as a transport failure", async () => {
    const { client } = clientAnswering(
      () => new Response("<html>Bad gateway</html>", { status: 502 })
    );
    const call = client.call("health", {});

    await expect(call).rejects.toBeInstanceOf(TransportFailure);
    await expect(call).rejects.toMatchObject({
      tag: "health",
      reason: "undecodable",
    });
    await client.dispose();
  });

  it("gives a network failure a message a person can act on", async () => {
    const client = makeProductClient({
      url: "https://api.example/api/rpc",
      client: "web",
      fetch: async () => {
        await Promise.resolve();
        throw new TypeError("Failed to fetch");
      },
    });
    const call = client.call("health", {});

    await expect(call).rejects.toBeInstanceOf(TransportFailure);
    await expect(call).rejects.toMatchObject({
      reason: "network",
      message:
        "Couldn't reach pcobooster. Check your connection and try again.",
    });
    await client.dispose();
  });

  it("rejects with AbortError when the signal aborts", async () => {
    const { client, sent } = clientAnswering(() => Response.json([]));
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.call("health", {}, { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sent).toStrictEqual([]);
    await client.dispose();
  });

  it("sends reads at speculative priority, and refuses that priority for writes at compile time", async () => {
    const { client, sent } = clientAnswering((requestId) =>
      Response.json([
        { _tag: "Exit", requestId, exit: { _tag: "Success", value: [] } },
      ])
    );

    await client.call("catalog.serviceTypes", {}, { priority: "speculative" });

    expect(speculativeWrite).toBeTypeOf("function");
    await expect(sent[0]?.clone().text()).resolves.toContain(
      '"headers":[["x-pcobooster-priority","speculative"]]'
    );
    await client.dispose();
  });
});

describe(failureStatus, () => {
  it.each([
    [new NotFound({ message: "No plan", resource: "plan" }), 404, "NOT_FOUND"],
    [
      new RateLimited({ message: "held back", service: "planning-center" }),
      429,
      "TOO_MANY_REQUESTS",
    ],
    [
      new ClientOutdated({ message: "Reload", minimumProtocolVersion: 2 }),
      426,
      "CLIENT_OUTDATED",
    ],
    [
      new TransportFailure({ tag: "health", reason: "network", cause: null }),
      503,
      "SERVICE_UNAVAILABLE",
    ],
    [new TypeError("not a call failure"), undefined, undefined],
  ])("reads %o as %s", (failure, status, code) => {
    expect({
      status: failureStatus(failure),
      code: failureCode(failure),
    }).toStrictEqual({ status, code });
  });
});

describe(failureMessage, () => {
  it.each([
    [
      new Conflict({ message: "Someone else saved first", reason: "stale" }),
      "Someone else saved first",
    ],
    [new Conflict({ message: "", reason: "stale" }), "Fallback"],
    [
      new TransportFailure({ tag: "health", reason: "network", cause: null }),
      "Couldn't reach pcobooster. Check your connection and try again.",
    ],
    [new TypeError("private diagnostic"), "Fallback"],
  ])("reads %o as %s", (failure, message) => {
    expect(failureMessage(failure, "Fallback")).toBe(message);
  });
});
