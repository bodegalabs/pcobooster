import { Effect } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";

const fetchHttpClient: HttpClient.HttpClient = Effect.runSync(
  Effect.provide(
    Effect.gen(function* readFetchHttpClient() {
      return yield* HttpClient.HttpClient;
    }),
    FetchHttpClient.layer
  )
);

/** Sends every request through `fetch`, so a test can script and observe each one. */
export const httpClientFor = (
  fetch: typeof globalThis.fetch
): HttpClient.HttpClient =>
  HttpClient.transform(fetchHttpClient, (effect) =>
    Effect.provideService(effect, FetchHttpClient.Fetch, fetch)
  );
