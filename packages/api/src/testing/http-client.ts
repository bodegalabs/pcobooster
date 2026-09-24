import { Effect } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

/** What a successful Planning Center DELETE answers. */
export const noContentResponse = (): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    HttpClientRequest.get("https://api.planningcenteronline.com/"),
    new Response(null, { status: 204 })
  );

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

/** For tests that stub client methods: any request that reaches `fetch` fails loudly. */
export const unreachableHttpClient: HttpClient.HttpClient = httpClientFor(
  async () => {
    await Promise.resolve();
    throw new Error("Unexpected Planning Center request in a test");
  }
);
