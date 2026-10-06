/** Development-only HTTP transport for the copied Swift scenarios. */
import { faultOutcome, productFaultSchema } from "@pcobooster/contracts/faults";
import type { ProductFault } from "@pcobooster/contracts/faults";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { RequestRejected } from "@pcobooster/contracts/faults/request-rejected";
import { procedureRoutes } from "@pcobooster/contracts/http/api";
import {
  API_VERSION,
  SERVER_VERSION_HEADER,
} from "@pcobooster/contracts/http/client-version";
import { matchRoute } from "@pcobooster/contracts/http/route";
import { Effect, Schema } from "effect";
import type { Json } from "effect/Schema";

import { fixtureFiles } from "./fixture-files";

const FixtureFileSchema = Schema.Struct({
  default: Schema.Json,
  cases: Schema.optional(
    Schema.Array(Schema.Struct({ match: Schema.Json, output: Schema.Json }))
  ),
});
type FixtureFile = typeof FixtureFileSchema.Type;

/** Each procedure's parsed fixture, by tag. */
export const fixtures: ReadonlyMap<string, FixtureFile> = new Map(
  Object.entries(fixtureFiles).map(([tag, file]) => [
    tag,
    Schema.decodeUnknownSync(FixtureFileSchema)(file),
  ])
);

const isJsonString = Schema.is(Schema.String);
const isJsonObject = Schema.is(Schema.Record(Schema.String, Schema.Json));
const isJsonArray = Schema.is(Schema.Array(Schema.Json));

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;

/** Two strings that name the same instant (`...00Z` and `...00.000Z`) match. */
const sameInstant = (expected: string, actual: string): boolean =>
  ISO_INSTANT.test(expected) &&
  ISO_INSTANT.test(actual) &&
  Date.parse(expected) === Date.parse(actual);

/** Whether `actual` contains `expected`: objects by subset, arrays item by item, the rest by value. */
export const matchesFixture = (
  expected: Json,
  actual: Json | undefined
): boolean => {
  if (isJsonObject(expected)) {
    return (
      actual !== undefined &&
      isJsonObject(actual) &&
      Object.entries(expected).every(([key, value]) =>
        matchesFixture(value, actual[key])
      )
    );
  }
  if (isJsonArray(expected)) {
    return (
      actual !== undefined &&
      isJsonArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, index) => matchesFixture(value, actual[index]))
    );
  }
  if (isJsonString(expected) && actual !== undefined && isJsonString(actual)) {
    return expected === actual || sameInstant(expected, actual);
  }
  return Object.is(expected, actual);
};

/** What a call answers: a fixture output, or none when the procedure has no fixture. */
export type FixtureAnswer =
  | { readonly found: true; readonly value: Json }
  | { readonly found: false };

export const fixtureAnswer = (tag: string, payload: Json): FixtureAnswer => {
  const file = fixtures.get(tag);
  if (file === undefined) {
    return { found: false };
  }
  const answer = file.cases?.find((fixtureCase) =>
    matchesFixture(fixtureCase.match, payload)
  );
  return {
    found: true,
    value: answer === undefined ? file.default : answer.output,
  };
};

const jsonResponse = (
  value: Json,
  status = 200,
  headers: Record<string, string> = {}
): Response =>
  // React Native's fetch polyfill has no static Response.json.
  // eslint-disable-next-line unicorn/prefer-response-static-json
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      [SERVER_VERSION_HEADER]: String(API_VERSION),
      ...headers,
    },
  });

const faultResponse = (
  fault: ProductFault,
  status: number = faultOutcome[fault._tag].status,
  headers: Record<string, string> = {}
): Response => {
  const responseHeaders = { ...headers };
  if (fault._tag === "RateLimited" && fault.retryAfterSeconds !== undefined) {
    responseHeaders["retry-after"] = String(fault.retryAfterSeconds);
  }
  return jsonResponse(
    Schema.encodeSync(Schema.toCodecJson(productFaultSchema))(fault),
    status,
    responseHeaders
  );
};

const queryInput = (url: URL) => {
  const input: Record<string, Json> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    input[key] = values.length === 1 ? (values[0] ?? "") : values;
  }
  return input;
};

export interface FixtureFetchOptions {
  /** Delay before every reply, so loading states show (Swift `-PCOBMockLatency`, default 250). */
  readonly latencyMs: number;
  /** Outputs that replace a procedure's fixture, such as `features.status` (`-PCOBFeatures`). */
  readonly overrides?: Readonly<Record<string, Json>>;
}

/** Answers declared HTTP endpoints without leaving the device. */
export const makeFixtureFetch =
  ({
    latencyMs,
    overrides = {},
  }: FixtureFetchOptions): typeof globalThis.fetch =>
  async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const match = matchRoute(procedureRoutes, request.method, url.pathname);
    if (latencyMs > 0) {
      await Effect.runPromise(Effect.sleep(latencyMs), {
        signal: request.signal,
      });
    }
    if (match.kind !== "found") {
      return faultResponse(
        new RequestRejected({
          message: "Unknown fixture endpoint.",
          reason: "unknown-endpoint",
        }),
        match.kind === "wrong-method" ? 405 : 400,
        match.kind === "wrong-method" ? { allow: match.allow.join(", ") } : {}
      );
    }
    let payload: Json = match.params;
    if (match.route.input === "query") {
      payload = { ...queryInput(url), ...match.params };
    } else if (match.route.input === "body") {
      try {
        const body = Schema.decodeUnknownSync(Schema.Json)(
          await request.json()
        );
        if (!isJsonObject(body)) {
          return faultResponse(
            new RequestRejected({
              message: "Expected a JSON object.",
              reason: "invalid-payload",
            })
          );
        }
        payload = {
          ...Schema.decodeUnknownSync(
            Schema.Record(Schema.String, Schema.Json)
          )(body),
          ...match.params,
        };
      } catch {
        return faultResponse(
          new RequestRejected({
            message: "Malformed JSON body.",
            reason: "malformed-request",
          })
        );
      }
    }
    const override = overrides[match.route.tag];
    const answer =
      override === undefined
        ? fixtureAnswer(match.route.tag, payload)
        : { found: true, value: override };
    return answer.found
      ? jsonResponse(answer.value)
      : faultResponse(
          new NotFound({
            message: `No fixture for ${match.route.tag}`,
            resource: match.route.tag,
          })
        );
  };
