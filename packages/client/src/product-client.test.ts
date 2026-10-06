import {
  makeProductClient,
  TransportFailure,
} from "@pcobooster/client/product-client";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
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
});
