/**
 * JSON-over-HTTP for the CI control-plane providers. Tokens travel as `Redacted` values, and
 * failures carry only the status and the API's own error message, never a response body, because
 * secret endpoints can echo secret values.
 */
import { Data, Effect, Option, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import type { HttpClientResponse } from "effect/unstable/http";

export class InfraApiError extends Data.TaggedError("InfraApiError")<{
  readonly service: string;
  readonly operation: string;
  readonly status: number | undefined;
  readonly detail: string;
}> {
  override get message(): string {
    const status = this.status === undefined ? "" : ` (HTTP ${this.status})`;
    return `${this.service} ${this.operation} failed${status}: ${this.detail}`;
  }
}

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface JsonRequest {
  readonly service: string;
  readonly operation: string;
  readonly method: HttpMethod;
  readonly url: string;
  readonly token: Redacted.Redacted;
  readonly body?: Schema.Json;
  readonly headers?: Readonly<Record<string, string>>;
}

const ApiErrorBody = Schema.Struct({ message: Schema.optional(Schema.String) });
const maxDetailLength = 300;
const notFoundStatus = 404;
const noContentStatus = 204;

const errorDetail = (response: HttpClientResponse.HttpClientResponse) =>
  response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ApiErrorBody)),
    Effect.map((body) => body.message?.slice(0, maxDetailLength)),
    Effect.option,
    Effect.map(Option.flatMap(Option.fromNullishOr)),
    Effect.map(Option.getOrElse(() => "no error message returned"))
  );

const baseRequest = (request: JsonRequest) => {
  const base = HttpClientRequest.make(request.method)(request.url).pipe(
    HttpClientRequest.bearerToken(Redacted.value(request.token)),
    HttpClientRequest.acceptJson,
    HttpClientRequest.setHeaders(request.headers ?? {})
  );
  return request.body === undefined
    ? base
    : HttpClientRequest.bodyJsonUnsafe(base, request.body);
};

/**
 * Sends one JSON request and decodes the reply. A 404 is `Option.none()`, so callers treat "does
 * not exist" as an observation rather than a failure.
 */
export const sendJson = Effect.fn("sendJson")(function* sendJson<A>(
  request: JsonRequest,
  schema: Schema.ConstraintDecoder<A>
) {
  const fail = (status: number | undefined, detail: string) =>
    new InfraApiError({
      service: request.service,
      operation: request.operation,
      status,
      detail,
    });
  const client = yield* HttpClient.HttpClient;
  const response = yield* client
    .execute(baseRequest(request))
    .pipe(
      Effect.mapError(() => fail(undefined, "the request did not complete"))
    );
  if (response.status === notFoundStatus) {
    return Option.none<A>();
  }
  if (response.status < 200 || response.status >= 300) {
    return yield* fail(response.status, yield* errorDetail(response));
  }
  const json =
    response.status === noContentStatus
      ? null
      : yield* response.json.pipe(
          Effect.mapError(() => fail(response.status, "the reply was not JSON"))
        );
  // Schema issues can quote the offending input, so only the operation is reported.
  const decoded = yield* Schema.decodeUnknownEffect(schema)(json).pipe(
    Effect.mapError(() =>
      fail(response.status, "the reply did not match the expected shape")
    )
  );
  return Option.some(decoded);
});

/** Like {@link sendJson}, but a missing resource is a failure. */
export const sendJsonRequired = <A>(
  request: JsonRequest,
  schema: Schema.ConstraintDecoder<A>
) =>
  sendJson(request, schema).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new InfraApiError({
              service: request.service,
              operation: request.operation,
              status: notFoundStatus,
              detail: "not found",
            })
          ),
        onSome: (value) => Effect.succeed(value),
      })
    )
  );
