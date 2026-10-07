/**
 * The one product client for web, SSR, Expo, and the deploy check: the typed client Effect's
 * `HttpApiClient` derives from the API (`api.people.search({ query: { query } })`), and `run`,
 * which runs one of its calls as a Promise with an abort signal, a priority, and extra headers.
 *
 * Every request goes through one HttpClient, which adds the headers no call site repeats: the
 * client version, the caller's own (Expo: bearer token, account, demo), and the priority, which
 * the route table lets out as speculative only for reads.
 */
import { faultOutcome, isProductFault } from "@pcobooster/contracts/faults";
import {
  procedureRoutes,
  ProductWireApi,
} from "@pcobooster/contracts/http/api";
import type { ReadEndpointNames } from "@pcobooster/contracts/http/api";
import {
  CLIENT_HEADER,
  formatClientHeader,
} from "@pcobooster/contracts/http/client-version";
import type { ClientName } from "@pcobooster/contracts/http/client-version";
import { matchRoute } from "@pcobooster/contracts/http/route";
import { REQUEST_PRIORITY_HEADER } from "@pcobooster/contracts/request-priority";
import type { RequestPriority } from "@pcobooster/contracts/request-priority";
import { Cause, Data, Effect, Exit, Layer, Option } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { HttpApiClient } from "effect/unstable/httpapi";

import { CallOptions } from "./call-options";

/** Every endpoint, by group and name: `api.<group>.<endpoint>({ params, query, payload })`. */
export type ProductApi = HttpApiClient.ForApi<typeof ProductWireApi>;

/** Native client with writes excluded from query callbacks by the contract declarations. */
export type ProductReadApi = {
  [Group in keyof ProductApi]: Pick<
    ProductApi[Group],
    Extract<ReadEndpointNames[Group], keyof ProductApi[Group]>
  >;
};

export interface ProductClientConfig {
  /** The API's origin; every path starts `/api/v1`. */
  readonly url: string;
  /** Sent as `x-pcobooster-client` with the API version. */
  readonly client: ClientName;
  /**
   * Web: "include" (cookies). Expo and the deploy check: "omit". SSR leaves it unset: workerd
   * fetches carry no ambient credentials, and its service binding forwards the cookie header.
   */
  readonly credentials?: RequestCredentials;
  /** SSR passes the API service binding's fetch; others use the global one. */
  readonly fetch?: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
  /**
   * HTTP headers read when each request is sent, for credentials that change while the client
   * lives (Expo: bearer token, account, demo).
   */
  readonly httpHeaders?: () => HeadersInit;
}

export interface RunOptions {
  /** Aborting interrupts the call and cancels its fetch; the call rejects with AbortError. */
  readonly signal?: AbortSignal;
  /** Default interactive. Speculative goes out on reads only; a write is always interactive. */
  readonly priority?: RequestPriority;
  /** HTTP headers for this call only (SSR forwards the incoming cookie this way). */
  readonly httpHeaders?: HeadersInit;
  /** Told the procedure (`people.search`) each request of the call names, from the route table. */
  readonly onProcedure?: (procedure: string) => void;
}

/** What a person sees when a call never reached the API or its answer was unreadable. */
export const TRANSPORT_FAILURE_MESSAGE =
  "Couldn't reach pcobooster. Check your connection and try again.";

/**
 * The call never produced a product answer: the network failed, or the response was not one the
 * API declares (a gateway's HTML page, a body that did not decode, a status the endpoint does not
 * answer). Client-only; never on the wire.
 * Its message is written for people, as a fault's is, so a failed write's toast is never blank.
 */
export class TransportFailure extends Data.TaggedError("TransportFailure")<{
  /** The procedure the call named, when its request was sent. */
  readonly procedure: string | null;
  readonly reason: "network" | "undecodable";
  readonly cause: unknown;
}> {
  override readonly message = TRANSPORT_FAILURE_MESSAGE;
}

/**
 * A transport failure retries as an unavailable gateway would (503: worth one retry, never a
 * 4xx), but reports its own code, so analytics tells a lost connection from a down API.
 */
const transportFailureOutcome = {
  status: 503,
  code: "NETWORK_ERROR",
} as const;

const callFailureOutcome = (
  error: Error
): { readonly status: number; readonly code: string } | undefined => {
  if (isProductFault(error)) {
    return faultOutcome[error._tag];
  }
  if (error instanceof TransportFailure) {
    return transportFailureOutcome;
  }
  return undefined;
};

/**
 * The HTTP status a failed call stands for (`faultOutcome`, the status table the server logs),
 * or undefined for anything that is not a call failure (an abort, a bug in the caller). The one
 * status read for retries and navigation.
 */
export const failureStatus = (error: Error): number | undefined =>
  callFailureOutcome(error)?.status;

/** The failure's stable code (`NOT_FOUND`, `TOO_MANY_REQUESTS`), for analytics; never a message. */
export const failureCode = (error: Error): string | undefined =>
  callFailureOutcome(error)?.code;

/**
 * What to tell a person about a failed call: a fault's or transport failure's own message, which
 * is written for people, or `fallback` for anything else (a bug's message is never shown).
 */
export const failureMessage = (error: Error, fallback: string): string =>
  (isProductFault(error) || error instanceof TransportFailure) &&
  error.message !== ""
    ? error.message
    : fallback;

export interface ProductClient {
  readonly api: ProductApi;
  /**
   * Runs one call. Resolves with the decoded success; rejects with a ProductFault, a
   * TransportFailure, or an AbortError `DOMException` when its signal aborts.
   */
  readonly run: <Value, Failure>(
    call: (api: ProductApi) => Effect.Effect<Value, Failure>,
    options?: RunOptions
  ) => Promise<Value>;
}

/** Every request's headers: the client's, the caller's, the call's, and its priority. */
const withHeaders =
  (config: ProductClientConfig) =>
  (request: HttpClientRequest.HttpClientRequest) =>
    Effect.map(Effect.serviceOption(CallOptions), (call) => {
      const match = matchRoute(
        procedureRoutes,
        request.method,
        new URL(request.url, "http://api").pathname
      );
      const route = match.kind === "found" ? match.route : undefined;
      const headers = new Headers(config.httpHeaders?.());
      if (Option.isSome(call)) {
        for (const [name, value] of call.value.headers) {
          headers.set(name, value);
        }
        if (route !== undefined) {
          call.value.named(route.tag);
        }
      }
      headers.set(CLIENT_HEADER, formatClientHeader(config.client));
      headers.set(
        REQUEST_PRIORITY_HEADER,
        route?.kind === "read" && Option.isSome(call)
          ? call.value.priority
          : "interactive"
      );
      return HttpClientRequest.setHeaders(request, headers);
    });

/** Config's fetch, carrying the global fetch's runtime extras (Bun's `preconnect`). */
const fetchFor = ({ fetch }: ProductClientConfig): typeof globalThis.fetch => {
  if (fetch === undefined) {
    return globalThis.fetch;
  }
  const send = async (input: RequestInfo | URL, init?: RequestInit) =>
    await fetch(input, init);
  return Object.assign(send, globalThis.fetch);
};

const httpClientLayer = (config: ProductClientConfig) =>
  FetchHttpClient.layer.pipe(
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit)(
        config.credentials === undefined
          ? {}
          : { credentials: config.credentials }
      )
    ),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch)(fetchFor(config)))
  );

const abortError = (): DOMException =>
  new DOMException("The call was aborted", "AbortError");

/** The value, or the one thing a failed call rejects with. */
const settle = <Value>(
  procedure: string | null,
  exit: Exit.Exit<Value, unknown>
): Value => {
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    throw abortError();
  }
  const failure = exit.cause.reasons.find(Cause.isFailReason)?.error;
  if (isProductFault(failure)) {
    throw failure;
  }
  throw new TransportFailure({
    procedure,
    reason:
      HttpClientError.isHttpClientError(failure) &&
      failure.reason._tag === "TransportError"
        ? "network"
        : "undecodable",
    cause: failure ?? Cause.squash(exit.cause),
  });
};

export const makeProductClient = (
  config: ProductClientConfig
): ProductClient => {
  const api = Effect.runSync(
    HttpApiClient.make(ProductWireApi, {
      baseUrl: config.url,
      transformClient: HttpClient.mapRequestEffect(withHeaders(config)),
    }).pipe(Effect.provide(httpClientLayer(config)))
  );
  return {
    api,
    run: async (call, options = {}) => {
      if (options.signal?.aborted === true) {
        throw abortError();
      }
      let procedure: string | null = null;
      const exit = await Effect.runPromiseExit(
        call(api).pipe(
          Effect.provideService(CallOptions, {
            priority: options.priority ?? "interactive",
            headers: new Headers(options.httpHeaders),
            named: (name) => {
              procedure = name;
              options.onProcedure?.(name);
            },
          })
        ),
        { signal: options.signal }
      );
      return settle(procedure, exit);
    },
  };
};
