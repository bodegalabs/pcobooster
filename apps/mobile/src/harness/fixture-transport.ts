/**
 * The development fixture transport: a `fetch` for `makeProductClient` that answers every RPC
 * from the bundled fixtures, so screens run on the real client, its decoding, and its typed
 * faults with nothing leaving the device (the Swift app's `MockTransport`).
 *
 * A fixture's first case whose `match` is a JSON subset of the call's payload answers, else its
 * default. A procedure without a fixture answers `NotFound`, as a missing route would.
 */
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

/** The parts of an RPC request message the transport reads. */
const decodeRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      id: Schema.Union([Schema.String, Schema.Number]),
      tag: Schema.String,
      payload: Schema.optional(Schema.Json),
    })
  )
);

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

const exitFor = (
  tag: string,
  payload: Json,
  overrides: Readonly<Record<string, Json>>
) => {
  const override = overrides[tag];
  const answer: FixtureAnswer =
    override === undefined
      ? fixtureAnswer(tag, payload)
      : { found: true, value: override };
  if (!answer.found) {
    return {
      _tag: "Failure",
      cause: [
        {
          _tag: "Fail",
          error: {
            _tag: "NotFound",
            message: `No fixture for ${tag}`,
            resource: tag,
          },
        },
      ],
    };
  }
  return { _tag: "Success", value: answer.value };
};

export interface FixtureFetchOptions {
  /** Delay before every reply, so loading states show (Swift `-PCOBMockLatency`, default 250). */
  readonly latencyMs: number;
  /** Outputs that replace a procedure's fixture, such as `features.status` (`-PCOBFeatures`). */
  readonly overrides?: Readonly<Record<string, Json>>;
}

/** A `fetch` that answers RPC calls from the fixtures. */
export const makeFixtureFetch =
  ({
    latencyMs,
    overrides = {},
  }: FixtureFetchOptions): typeof globalThis.fetch =>
  async (input, init) => {
    const request = decodeRequest(await new Request(input, init).text());
    if (latencyMs > 0) {
      await Effect.runPromise(Effect.sleep(latencyMs), {
        signal: init?.signal ?? undefined,
      });
    }
    const exit = exitFor(request.tag, request.payload ?? {}, overrides);
    // React Native's fetch polyfill has no static `Response.json`.
    const body = JSON.stringify([
      { _tag: "Exit", requestId: request.id, exit },
    ]);
    return new Response(body, {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
