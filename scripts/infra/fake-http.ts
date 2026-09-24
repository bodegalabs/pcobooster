/** A scripted `HttpClient` for provider tests: records each request and replays canned replies. */
import { Effect, Layer, Option, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import type { HttpClientRequest } from "effect/unstable/http";

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly body: Schema.Json | undefined;
}

export interface CannedReply {
  readonly status: number;
  readonly body?: Schema.Json;
}

const decodeJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

const decodeBody = (
  request: HttpClientRequest.HttpClientRequest
): Schema.Json | undefined =>
  request.body._tag === "Uint8Array"
    ? Option.getOrUndefined(
        decodeJson(new TextDecoder().decode(request.body.body))
      )
    : undefined;

/** Serve `replies` in order; the returned `requests` array fills as the client is used. */
export const fakeHttp = (replies: readonly CannedReply[]) => {
  const requests: RecordedRequest[] = [];
  const queue = [...replies];
  const client = HttpClient.make((request, url) => {
    requests.push({
      method: request.method,
      url: url.toString(),
      authorization: request.headers.authorization,
      body: decodeBody(request),
    });
    const reply = queue.shift() ?? {
      status: 599,
      body: { message: "unscripted" },
    };
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(
          reply.body === undefined ? null : JSON.stringify(reply.body),
          {
            status: reply.status,
            headers: { "content-type": "application/json" },
          }
        )
      )
    );
  });
  return {
    layer: Layer.succeed(HttpClient.HttpClient, client),
    requests,
  };
};
