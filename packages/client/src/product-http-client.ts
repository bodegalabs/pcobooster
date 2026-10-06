import { TransportFailure } from "@pcobooster/client/product-client";
/**
 * The product client over HttpApi (spike: the three endpoints ported so far). Same `call` shape
 * as `makeProductClient`: `client.call("people.planWindowHistory", input, options)` with typed
 * input and output per tag, rejecting with the same fault classes and `TransportFailure`. Each
 * call goes through `HttpApiClient` built from `ProductWireApi`; the one line per operation in
 * `senders` splits the input into path params and query or body, and the `Senders` type makes a
 * missing operation a compile error.
 */
import { isProductFault } from "@pcobooster/contracts/faults";
import { ProductWireApi } from "@pcobooster/contracts/http/api";
import type { chordChartsSong } from "@pcobooster/contracts/http/chord-charts";
import {
  CLIENT_HEADER,
  formatApiClientHeader,
} from "@pcobooster/contracts/http/client-version";
import type { peoplePlanWindowHistory } from "@pcobooster/contracts/http/people";
import type { scheduleUpdateStatus } from "@pcobooster/contracts/http/schedule";
import { REQUEST_PRIORITY_HEADER } from "@pcobooster/contracts/request-priority";
import type { RequestPriority } from "@pcobooster/contracts/request-priority";
import type { ClientName } from "@pcobooster/contracts/rpc/client-version";
import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
} from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { HttpApiClient } from "effect/unstable/httpapi";
import type { HttpApiEndpoint } from "effect/unstable/httpapi";

/** What callers pass: the encoded side of the endpoint's params and query (a read). */
type ReadInput<Declaration extends { readonly wire: unknown }> =
  HttpApiEndpoint.Params<Declaration["wire"]>["Type"] &
    HttpApiEndpoint.Query<Declaration["wire"]>["Type"];

/** What callers pass: the encoded side of the endpoint's params and payload (a write). */
type WriteInput<Declaration extends { readonly wire: unknown }> =
  HttpApiEndpoint.Params<Declaration["wire"]>["Type"] &
    HttpApiEndpoint.Payload<Declaration["wire"]>["Type"];

type Api = HttpApiClient.ForApi<typeof ProductWireApi>;

/** One line per operation: how its input splits into the request's parts. */
const senders = (api: Api) => ({
  "people.planWindowHistory": (
    input: ReadInput<typeof peoplePlanWindowHistory>
  ) => api.people.planWindowHistory({ params: {}, query: input }),
  "schedule.updateStatus": ({
    planPersonId,
    ...payload
  }: WriteInput<typeof scheduleUpdateStatus>) =>
    api.schedule.updateStatus({ params: { planPersonId }, payload }),
  "chordCharts.song": (input: ReadInput<typeof chordChartsSong>) =>
    api.chordCharts.song({ params: input, query: {} }),
});

type SenderLines = ReturnType<typeof senders>;
export type HttpProcedureTag = keyof SenderLines;
export type HttpProcedureInput<Tag extends HttpProcedureTag> = Parameters<
  SenderLines[Tag]
>[0];
export type HttpProcedureOutput<Tag extends HttpProcedureTag> = Effect.Success<
  ReturnType<SenderLines[Tag]>
>;
type HttpProcedureError<Tag extends HttpProcedureTag> = Effect.Error<
  ReturnType<SenderLines[Tag]>
>;

/** The sender lines as one mapped type, so a call by tag keeps that tag's types. */
type Senders = {
  readonly [Tag in HttpProcedureTag]: (
    input: HttpProcedureInput<Tag>
  ) => Effect.Effect<HttpProcedureOutput<Tag>, HttpProcedureError<Tag>>;
};

export interface ProductHttpClientConfig {
  /** The API's origin; endpoints add `/api/v1/...`. */
  readonly url: string;
  /** Sent as `x-pcobooster-client` with the API version. */
  readonly client: ClientName;
  /** Web: "include" (cookies). Expo and the deploy check: "omit". SSR leaves it unset. */
  readonly credentials?: RequestCredentials;
  /** SSR passes the API service binding's fetch; others use the global one. */
  readonly fetch?: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
  /** HTTP headers read when each call is sent (Expo: bearer token, account, demo). */
  readonly httpHeaders?: () => HeadersInit;
}

export interface HttpCallOptions {
  /** Aborting interrupts the call and cancels its fetch; the call rejects with AbortError. */
  readonly signal?: AbortSignal;
  readonly priority?: RequestPriority;
  /** HTTP headers for this call only (SSR forwards the incoming cookie this way). */
  readonly httpHeaders?: HeadersInit;
}

export interface ProductHttpClient {
  /**
   * Resolves with the decoded success; rejects with a ProductFault, a TransportFailure, or an
   * AbortError `DOMException` when its signal aborts.
   */
  readonly call: <Tag extends HttpProcedureTag>(
    tag: Tag,
    input: HttpProcedureInput<Tag>,
    options?: HttpCallOptions
  ) => Promise<HttpProcedureOutput<Tag>>;
  readonly dispose: () => Promise<void>;
}

const ProductApiClient = Context.Service<Senders>(
  "@pcobooster/client/ProductApiClient"
);

/** Per-call HTTP headers, read by the HTTP client inside the call's fiber. */
const CallHttpHeaders = Context.Service<Headers>(
  "@pcobooster/client/ApiCallHttpHeaders"
);

const withCallHeaders =
  (config: ProductHttpClientConfig) =>
  (request: HttpClientRequest.HttpClientRequest) =>
    Effect.map(Effect.serviceOption(CallHttpHeaders), (perCall) => {
      const headers = new Headers(config.httpHeaders?.());
      headers.set(CLIENT_HEADER, formatApiClientHeader(config.client));
      if (Option.isSome(perCall)) {
        for (const [name, value] of perCall.value) {
          headers.set(name, value);
        }
      }
      return HttpClientRequest.setHeaders(request, headers);
    });

const fetchFor = ({
  fetch,
}: ProductHttpClientConfig): typeof globalThis.fetch => {
  if (fetch === undefined) {
    return globalThis.fetch;
  }
  const send = async (input: RequestInfo | URL, init?: RequestInit) =>
    await fetch(input, init);
  return Object.assign(send, globalThis.fetch);
};

const clientLayer = (config: ProductHttpClientConfig) =>
  Layer.effect(ProductApiClient)(
    HttpApiClient.make(ProductWireApi, {
      baseUrl: config.url,
      transformClient: HttpClient.mapRequestEffect(withCallHeaders(config)),
    }).pipe(Effect.map((api): Senders => senders(api)))
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
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
  tag: HttpProcedureTag,
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
    tag,
    reason:
      HttpClientError.isHttpClientError(failure) &&
      failure.reason._tag === "TransportError"
        ? "network"
        : "undecodable",
    cause: failure ?? Cause.squash(exit.cause),
  });
};

export const makeProductHttpClient = (
  config: ProductHttpClientConfig
): ProductHttpClient => {
  const runtime = ManagedRuntime.make(clientLayer(config));
  const send = <Tag extends HttpProcedureTag>(
    tag: Tag,
    input: HttpProcedureInput<Tag>
  ): Effect.Effect<
    HttpProcedureOutput<Tag>,
    HttpProcedureError<Tag>,
    Senders
  > => ProductApiClient.pipe(Effect.flatMap((client) => client[tag](input)));
  return {
    call: async (tag, input, options = {}) => {
      if (options.signal?.aborted === true) {
        throw abortError();
      }
      const headers = new Headers(options.httpHeaders);
      headers.set(REQUEST_PRIORITY_HEADER, options.priority ?? "interactive");
      const exit = await runtime.runPromiseExit(
        send(tag, input).pipe(Effect.provideService(CallHttpHeaders, headers)),
        { signal: options.signal }
      );
      return settle(tag, exit);
    },
    dispose: async () => {
      await runtime.dispose();
    },
  };
};
