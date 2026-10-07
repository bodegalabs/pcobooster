import {
  faultOutcome,
  isProductFault,
  productFaultSchema,
} from "@pcobooster/contracts/faults";
import { procedureRoutes } from "@pcobooster/contracts/http/api";
import { matchRoute } from "@pcobooster/contracts/http/route";
import { Schema } from "effect";
import type { Json } from "effect/Schema";

import { makeFixtureFetch } from "../fixture-transport";

const object = Schema.Record(Schema.String, Schema.Json);
const string = Schema.is(Schema.String);
const array = Schema.is(Schema.Array(Schema.Json));
const scalar = (value: Json): string =>
  string(value) ? value : JSON.stringify(value);
interface RequestOptions {
  signal?: AbortSignal;
}
/** Holds or refuses endpoint responses after the native client has encoded an HTTP request. */
export const makeControlledFixture = () => {
  const fixture = makeFixtureFetch({ latencyMs: 0 });
  const transport = {
    handle: async (
      tag: string,
      input: Record<string, Json>,
      options?: RequestOptions
    ): Promise<Json> => {
      const route = procedureRoutes.find((candidate) => candidate.tag === tag);
      if (route === undefined) {
        throw new Error(`Unknown endpoint ${tag}`);
      }
      const url = new URL(route.path, "https://fixtures.invalid");
      for (const name of route.params) {
        url.pathname = url.pathname.replace(
          `:${name}`,
          encodeURIComponent(
            Schema.decodeUnknownSync(Schema.String)(input[name])
          )
        );
      }
      if (route.input === "query") {
        for (const [key, value] of Object.entries(input)) {
          if (route.params.includes(key)) {
            continue;
          }
          if (array(value)) {
            for (const item of value) {
              url.searchParams.append(key, scalar(item));
            }
          } else {
            url.searchParams.set(key, scalar(value));
          }
        }
      }
      const init: RequestInit = {
        method: route.method,
        signal: options?.signal,
      };
      if (route.input === "body") {
        init.body = JSON.stringify(input);
        init.headers = { "content-type": "application/json" };
      }
      const response = await fixture(url, init);
      return Schema.decodeUnknownSync(Schema.Json)(await response.json());
    },
  };
  const fetch: typeof globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const match = matchRoute(procedureRoutes, request.method, url.pathname);
      if (match.kind !== "found") {
        return await fixture(request);
      }
      const fields = { ...Schema.decodeUnknownSync(object)(match.params) };
      if (match.route.input === "body") {
        Object.assign(
          fields,
          Schema.decodeUnknownSync(object)(await request.json())
        );
      }
      if (match.route.input === "query") {
        for (const key of new Set(url.searchParams.keys())) {
          const values = url.searchParams.getAll(key);
          fields[key] = values.length === 1 ? (values[0] ?? "") : values;
        }
      }
      try {
        return Response.json(await transport.handle(match.route.tag, fields));
      } catch (error) {
        if (!isProductFault(error)) {
          throw error;
        }
        return Response.json(
          Schema.encodeSync(Schema.toCodecJson(productFaultSchema))(error),
          { status: faultOutcome[error._tag].status }
        );
      }
    },
    globalThis.fetch
  );
  return { transport, fetch };
};
