import { classifyingProtocol } from "@pcobooster/api/rpc/protocol";
import { makeRpcExchange, RpcExchange } from "@pcobooster/api/rpc/services";
import { recordLogs } from "@pcobooster/api/testing/logs";
import { Effect } from "effect";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import type { FromServerEncoded } from "effect/unstable/rpc/RpcMessage";
import { describe, expect, it } from "vitest";

/** The stock HTTP protocol with `send` recorded instead of written to a response. */
const recordingProtocol = Effect.gen(function* recordingProtocol() {
  const sent: FromServerEncoded[] = [];
  const { protocol } = yield* RpcServer.makeProtocolWithHttpEffect();
  const recording: RpcServer.Protocol["Service"] = {
    ...protocol,
    send: (_clientId, response) =>
      Effect.sync(() => {
        sent.push(response);
      }),
  };
  return { sent, protocol: recording };
}).pipe(Effect.scoped, Effect.provide(RpcSerialization.layerJson));

describe(classifyingProtocol, () => {
  it("replaces a connection-level defect with a generic one and logs it as a rejected request", async () => {
    const { lines, capture } = recordLogs();
    const exchange = makeRpcExchange(
      new Request("http://api.test/api/rpc", { method: "POST" }),
      "request-defect",
      "web;rpc=1"
    );

    const sent = await Effect.runPromise(
      capture(
        Effect.gen(function* sendDefect() {
          const recording = yield* recordingProtocol;
          const { protocol } = classifyingProtocol(recording.protocol, {
            isKnownTag: () => true,
            report: null,
            now: () => 0,
            serialization: RpcSerialization.json,
          });
          yield* protocol.send(0, {
            _tag: "Defect",
            defect: "Invalid request id: [object Object]",
          });
          return recording.sent;
        }).pipe(Effect.provideService(RpcExchange, exchange))
      )
    );

    expect({
      sent,
      lines: lines.map(({ level, message, fields }) => ({
        level,
        message,
        procedure: fields.procedure,
        requestId: fields.requestId,
        status: fields.status,
        code: fields.code,
      })),
    }).toStrictEqual({
      sent: [
        { _tag: "Defect", defect: "The request is not a valid RPC request." },
      ],
      lines: [
        {
          level: "info",
          message: "rpc",
          procedure: "",
          requestId: "request-defect",
          status: 400,
          code: "BAD_REQUEST",
        },
      ],
    });
  });
});
