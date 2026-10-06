/**
 * The one product client for web, SSR, Expo, and the deploy check. Each client builds one
 * `ManagedRuntime` holding `HttpApiClient.make(ProductWireApi)`. Wire groups are top level, so
 * that client names each endpoint by its tag; a call is a lookup by tag, and a new endpoint needs
 * no client edit.
 *
 * A call hands the whole input to each part of the request: the path params, query, and body
 * schemas each keep only their own fields when they encode (`endpoint.ts` declares a part only
 * when it has fields), so the route table's param placement is the only split there is.
 */
import { TransportFailure } from "@pcobooster/client/product-client";
import { isProductFault } from "@pcobooster/contracts/faults";
import {
  procedureRoutes,
  ProductWireApi,
} from "@pcobooster/contracts/http/api";
import type {
  ProcedureTag,
  ReadProcedureTag,
} from "@pcobooster/contracts/http/api";
import {
  CLIENT_HEADER,
  formatApiClientHeader,
} from "@pcobooster/contracts/http/client-version";
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
import type { Schema } from "effect";
import type { Simplify } from "effect/Types";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { HttpApiClient } from "effect/unstable/httpapi";
import type { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

export type {
  ProcedureTag,
  ReadProcedureTag,
} from "@pcobooster/contracts/http/api";

type WireClient = HttpApiClient.ForApi<typeof ProductWireApi>;

type WireEndpoint<Tag extends ProcedureTag> = HttpApiEndpoint.WithIdentifier<
  HttpApiGroup.Endpoints<
    (typeof ProductWireApi)["groups"][keyof (typeof ProductWireApi)["groups"]]
  >,
  Tag
>;

/** One request part's fields, or none when the endpoint has no such part. */
type Part<Fields extends Schema.Top> = [Fields["Type"]] extends [never]
  ? Record<never, never>
  : NonNullable<Fields["Type"]>;

/**
 * The input's encoded form: what the server decodes. Untrimmed text is accepted here and
 * trimmed (or rejected) by the server, so input rules live in one place: the server's decode.
 */
export type ProcedureInput<Tag extends ProcedureTag> = Simplify<
  Part<HttpApiEndpoint.Params<WireEndpoint<Tag>>> &
    Part<HttpApiEndpoint.Query<WireEndpoint<Tag>>> &
    Part<HttpApiEndpoint.Payload<WireEndpoint<Tag>>>
>;

export type ProcedureOutput<Tag extends ProcedureTag> = Effect.Success<
  ReturnType<WireClient[Tag]>
>;

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
   * HTTP headers read when each call is sent, for credentials that change while the client
   * lives (Expo: bearer token, account, demo).
   */
  readonly httpHeaders?: () => HeadersInit;
}

export interface CallOptions<Tag extends ProcedureTag> {
  /** Aborting interrupts the call and cancels its fetch; the call rejects with AbortError. */
  readonly signal?: AbortSignal;
  /** Only reads may be sent at speculative priority. Default interactive. */
  readonly priority?: Tag extends ReadProcedureTag
    ? RequestPriority
    : "interactive";
  /** HTTP headers for this call only (SSR forwards the incoming cookie this way). */
  readonly httpHeaders?: HeadersInit;
}

/** A procedure that takes no input may be called without one. */
export type CallArguments<Tag extends ProcedureTag> =
  keyof ProcedureInput<Tag> extends never
    ? [input?: ProcedureInput<Tag>, options?: CallOptions<Tag>]
    : [input: ProcedureInput<Tag>, options?: CallOptions<Tag>];

export interface ProductClient {
  /**
   * Resolves with the decoded success; rejects with a ProductFault, a TransportFailure, or an
   * AbortError `DOMException` when its signal aborts.
   */
  readonly call: <Tag extends ProcedureTag>(
    tag: Tag,
    ...[input, options]: CallArguments<Tag>
  ) => Promise<ProcedureOutput<Tag>>;
  readonly dispose: () => Promise<void>;
}

/** The input, handed to every part of the request; each part keeps its own fields. */
interface WholeInput<Tag extends ProcedureTag> {
  readonly params: CallArguments<Tag>[0];
  readonly query: CallArguments<Tag>[0];
  readonly payload: CallArguments<Tag>[0];
}

/** The client's endpoint methods, keyed by tag, so a call by tag keeps its own types. */
type Senders = {
  readonly [Tag in ProcedureTag]: (
    request: WholeInput<Tag>
  ) => Effect.Effect<ProcedureOutput<Tag>, unknown>;
};

const ProductApiClient = Context.Service<Senders>(
  "@pcobooster/client/ProductApiClient"
);

/** Per-call HTTP headers, read by the HTTP client inside the call's fiber. */
const CallHttpHeaders = Context.Service<Headers>(
  "@pcobooster/client/CallHttpHeaders"
);

const withCallHeaders =
  (config: ProductClientConfig) =>
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

/** Config's fetch, carrying the global fetch's runtime extras (Bun's `preconnect`). */
const fetchFor = ({ fetch }: ProductClientConfig): typeof globalThis.fetch => {
  if (fetch === undefined) {
    return globalThis.fetch;
  }
  const send = async (input: RequestInfo | URL, init?: RequestInit) =>
    await fetch(input, init);
  return Object.assign(send, globalThis.fetch);
};

const clientLayer = (config: ProductClientConfig) =>
  Layer.effect(ProductApiClient)(
    HttpApiClient.make(ProductWireApi, {
      baseUrl: config.url,
      transformClient: HttpClient.mapRequestEffect(withCallHeaders(config)),
    }).pipe(Effect.map((client: WireClient): Senders => client))
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
  tag: ProcedureTag,
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

/** Reads, by tag: the only calls the client lets out at speculative priority. */
const readTags = new Set<string>();
for (const { tag, kind } of procedureRoutes) {
  if (kind === "read") {
    readTags.add(tag);
  }
}

export const makeProductClient = (
  config: ProductClientConfig
): ProductClient => {
  const runtime = ManagedRuntime.make(clientLayer(config));
  return {
    call: async (tag, ...[input, options = {}]) => {
      if (options.signal?.aborted === true) {
        throw abortError();
      }
      const headers = new Headers(options.httpHeaders);
      headers.set(
        REQUEST_PRIORITY_HEADER,
        readTags.has(tag) ? (options.priority ?? "interactive") : "interactive"
      );
      const exit = await runtime.runPromiseExit(
        ProductApiClient.pipe(
          Effect.flatMap((senders) =>
            senders[tag]({ params: input, query: input, payload: input })
          ),
          Effect.provideService(CallHttpHeaders, headers)
        ),
        { signal: options.signal }
      );
      return settle(tag, exit);
    },
    dispose: async () => {
      await runtime.dispose();
    },
  };
};
