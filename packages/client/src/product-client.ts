/**
 * The one product RPC client for web, SSR, Expo, and the deploy check. Each client builds one
 * `ManagedRuntime` holding `RpcClient.make(ProductWireRpc)`; every call is a lookup by tag on that
 * client, so a new procedure needs no client edit.
 */
import { faultOutcome, isProductFault } from "@pcobooster/contracts/faults";
import type { ProductFault } from "@pcobooster/contracts/faults";
import type { RequestPriority } from "@pcobooster/contracts/request-priority";
import { formatClientHeader } from "@pcobooster/contracts/rpc/client-version";
import type { ClientName } from "@pcobooster/contracts/rpc/client-version";
import { RPC_HEADERS } from "@pcobooster/contracts/rpc/procedure";
import { ProductWireRpc } from "@pcobooster/contracts/rpc/product";
import type {
  ProcedureTag,
  ProductWireRpcs,
  ReadProcedureTag,
} from "@pcobooster/contracts/rpc/product";
import {
  Cause,
  Context,
  Data,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
} from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import {
  RpcClient,
  RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";
import type { Rpc } from "effect/unstable/rpc";

type ProcedureOf<Tag extends ProcedureTag> = Rpc.ExtractTag<
  ProductWireRpcs,
  Tag
>;
/**
 * The payload's encoded form: what the server decodes. Untrimmed text is accepted here and
 * trimmed (or rejected) by the server, so the client never refuses input main's server took.
 */
export type ProcedureInput<Tag extends ProcedureTag> = Rpc.PayloadConstructor<
  ProcedureOf<Tag>
>;
export type ProcedureOutput<Tag extends ProcedureTag> = Rpc.Success<
  ProcedureOf<Tag>
>;

export interface ProductClientConfig {
  /** Absolute URL of `/api/rpc`. */
  readonly url: string;
  /** Sent as `x-pcobooster-client` with the RPC protocol version. */
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
   * lives (Expo: bearer token, account, demo). The server reads identity from HTTP headers only.
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

/** A procedure that takes no input (`Schema.Void`) may be called without one. */
export type CallArguments<Tag extends ProcedureTag> =
  undefined extends ProcedureInput<Tag>
    ? [input?: ProcedureInput<Tag>, options?: CallOptions<Tag>]
    : [input: ProcedureInput<Tag>, options?: CallOptions<Tag>];

/** What a person sees when a call never reached the API or its answer was unreadable. */
export const TRANSPORT_FAILURE_MESSAGE =
  "Couldn't reach pcobooster. Check your connection and try again.";

/**
 * The call never produced a product answer: the network failed, or the response was not an RPC
 * response (a gateway's HTML page, a body that did not decode). Client-only; never on the wire.
 * Its message is written for people, as a fault's is, so a failed write's toast is never blank.
 */
export class TransportFailure extends Data.TaggedError("TransportFailure")<{
  readonly tag: ProcedureTag;
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
 * The HTTP status a failed call stands for (main's table, `faultOutcome`), or undefined for
 * anything that is not a call failure (an abort, a bug in the caller). The one status read for
 * retries and navigation.
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

/** One sender per procedure, keyed by tag, so a call by tag keeps its own types. */
type Senders = {
  readonly [Tag in ProcedureTag]: (
    input: CallArguments<Tag>[0],
    options: { readonly headers: Record<string, string> }
  ) => Effect.Effect<
    ProcedureOutput<Tag>,
    ProductFault | RpcClientError.RpcClientError
  >;
};

const ProductRpcClient = Context.Service<Senders>(
  "@pcobooster/client/ProductRpcClient"
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
      headers.set(RPC_HEADERS.client, formatClientHeader(config.client));
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
  Layer.effect(ProductRpcClient)(
    RpcClient.make(ProductWireRpc).pipe(Effect.map((client): Senders => client))
  ).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: config.url,
        transformClient: HttpClient.mapRequestEffect(withCallHeaders(config)),
      })
    ),
    Layer.provide(RpcSerialization.layerJson),
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
      failure instanceof RpcClientError.RpcClientError &&
      failure.reason._tag !== "RpcClientDefect"
        ? "network"
        : "undecodable",
    cause: failure ?? Cause.squash(exit.cause),
  });
};

export const makeProductClient = (
  config: ProductClientConfig
): ProductClient => {
  const runtime = ManagedRuntime.make(clientLayer(config));
  return {
    call: async (tag, ...[input, options = {}]) => {
      if (options.signal?.aborted === true) {
        throw abortError();
      }
      const exit = await runtime.runPromiseExit(
        ProductRpcClient.pipe(
          Effect.flatMap((senders) =>
            senders[tag](input, {
              headers: {
                [RPC_HEADERS.priority]: options.priority ?? "interactive",
              },
            })
          ),
          Effect.provideService(
            CallHttpHeaders,
            new Headers(options.httpHeaders)
          )
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
