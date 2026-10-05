import { createRpcClient } from "@pcobooster/client/rpc";
import { makeRpcError } from "@pcobooster/client/testing";
import { RpcError } from "@pcobooster/contracts/errors";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const envelopeSchema = Schema.Struct({
  _tag: Schema.Literal("Request"),
  id: Schema.Union([Schema.String, Schema.Number]),
  tag: Schema.String,
  payload: Schema.Unknown,
});

const fixture = (value: JsonValue) => {
  const requests: Request[] = [];
  const client = createRpcClient({
    url: () => "https://pcobooster.com/api/rpc",
    credentials: "omit",
    headers: () => ({
      authorization: "Bearer synthetic",
      "x-pcobooster-account": "account-a",
    }),
    fetch: async (url, init) => {
      const request = new Request(url, init);
      requests.push(request.clone());
      const message = Schema.decodeUnknownSync(envelopeSchema)(
        await request.json()
      );
      return Response.json([
        {
          _tag: "Exit",
          requestId: message.id,
          exit: { _tag: "Success", value },
        },
      ]);
    },
  });
  return { client, requests };
};

describe("native Effect RPC client", () => {
  it("sends a single native message and preserves credential/account/priority headers", async () => {
    const { client, requests } = fixture({ authenticated: false });
    await expect(
      client.call(
        "session.status",
        {},
        { context: { priority: "speculative" } }
      )
    ).resolves.toStrictEqual({ authenticated: false });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://pcobooster.com/api/rpc/");
    expect(Object.fromEntries(requests[0]?.headers ?? [])).toMatchObject({
      authorization: "Bearer synthetic",
      "x-pcobooster-account": "account-a",
      "x-pcobooster-priority": "speculative",
    });
    await expect(requests[0]?.json()).resolves.toMatchObject({
      _tag: "Request",
      tag: "session.status",
      payload: {},
    });
  });

  it("hydrates native Date output through the pinned RPC JSON codec", async () => {
    const { client } = fixture([
      {
        id: "plan",
        title: "Evening",
        createdAt: "2026-10-02T01:00:00.000Z",
        sortDate: "2026-10-02T02:00:00.000Z",
      },
    ]);
    const plans = await client.call("catalog.plans", { serviceTypeId: "type" });
    expect(plans[0]?.sortDate).toStrictEqual(
      new Date("2026-10-02T02:00:00.000Z")
    );
  });

  it("rejects malformed success payloads rather than returning unvalidated data", async () => {
    const { client } = fixture({ authenticated: "yes" });
    await expect(client.call("session.status", {})).rejects.toBeDefined();
  });

  it("returns declared rate errors as RpcError with actionable retry data", async () => {
    const error = makeRpcError("TOO_MANY_REQUESTS", {
      data: {
        message: "Please retry",
        service: "planning-center",
        retryAfterSeconds: 7,
      },
    });
    const client = createRpcClient({
      url: () => "https://pcobooster.com/api/rpc",
      fetch: async (url, init) => {
        const request = new Request(url, init);
        const message = Schema.decodeUnknownSync(envelopeSchema)(
          await request.json()
        );
        return Response.json([
          {
            _tag: "Exit",
            requestId: message.id,
            exit: { _tag: "Failure", cause: [{ _tag: "Fail", error }] },
          },
        ]);
      },
    });
    await expect(client.call("session.status", {})).rejects.toBeInstanceOf(
      RpcError
    );
    await expect(client.call("session.status", {})).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      status: 429,
      data: { retryAfterSeconds: 7 },
    });
  });

  it("interrupts an in-flight HTTP request when a query aborts", async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | null | undefined;
    const started = Promise.withResolvers<null>();
    const client = createRpcClient({
      url: () => "https://pcobooster.com/api/rpc",
      fetch: async (_url, init) => {
        providerSignal = init?.signal;
        started.resolve(null);
        const pending = Promise.withResolvers<Response>();
        {
          init?.signal?.addEventListener(
            "abort",
            () => {
              pending.reject(new DOMException("Cancelled", "AbortError"));
            },
            { once: true }
          );
        }
        return await pending.promise;
      },
    });
    const pending = client.call(
      "session.status",
      {},
      { signal: controller.signal }
    );
    await started.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(providerSignal?.aborted).toBeTruthy();
  });
});
