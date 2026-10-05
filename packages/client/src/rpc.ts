import { ProductRpc } from "@pcobooster/contracts";
import { REQUEST_PRIORITY_HEADER } from "@pcobooster/contracts/request-priority";
import type { RequestPriority } from "@pcobooster/contracts/request-priority";
import { Cause, Effect, Exit } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";
import type { Rpc, RpcGroup } from "effect/rpc";

import { invokeProcedure } from "./invoke-procedure";

export type ProductProcedures = RpcGroup.Rpcs<typeof ProductRpc>;
export type Procedure = ProductProcedures["_tag"];
export type ProcedureInput<Tag extends Procedure> = Rpc.PayloadConstructor<
  Extract<ProductProcedures, { readonly _tag: Tag }>
>;
export type ProcedureOutput<Tag extends Procedure> = Rpc.Success<
  Extract<ProductProcedures, { readonly _tag: Tag }>
>;

export interface RpcCallOptions {
  signal?: AbortSignal;
  context?: { priority?: RequestPriority };
}

export interface RpcClientOptions {
  url: () => string;
  headers?: () => HeadersInit | Promise<HeadersInit>;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  credentials?: RequestCredentials;
  onError?: (error: Error) => void;
  onResponse?: (response: Response) => void;
}

/** One HTTP invocation per procedure; there is no batch sharing a Worker's request budget. */
export const createRpcClient = (options: RpcClientOptions) => {
  async function call<Tag extends Procedure>(
    tag: Tag,
    input: ProcedureInput<Tag>,
    callOptions?: RpcCallOptions
  ): Promise<ProcedureOutput<Tag>>;
  async function call(
    tag: Procedure,
    input: ProcedureInput<Procedure>,
    callOptions: RpcCallOptions = {}
  ): Promise<ProcedureOutput<Procedure>> {
    const headers = new Headers(await options.headers?.());
    if (callOptions.context?.priority === "speculative") {
      headers.set(REQUEST_PRIORITY_HEADER, "speculative");
    }
    const fetch = options.fetch ?? globalThis.fetch;
    let fetchFailure: unknown;
    const fetchWithContext = async (
      url: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const requestHeaders = new Headers(init?.headers);
      for (const [key, value] of headers) {
        requestHeaders.set(key, value);
      }
      try {
        const response = await fetch(url, {
          ...init,
          credentials: options.credentials ?? "omit",
          headers: requestHeaders,
        });
        options.onResponse?.(response);
        return response;
      } catch (error) {
        fetchFailure = error;
        throw error;
      }
    };
    const protocol = RpcClient.layerProtocolHttp({ url: options.url() });
    const program = Effect.scoped(
      Effect.gen(function* invokeRpc() {
        const client = yield* RpcClient.make(ProductRpc);
        return yield* invokeProcedure(client, tag, input);
      })
    ).pipe(
      Effect.provide(protocol),
      Effect.provide(RpcSerialization.layerJson),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        Object.assign(fetchWithContext, globalThis.fetch)
      )
    );
    const exit = await Effect.runPromiseExit(program, {
      signal: callOptions.signal,
    });
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    if (Cause.hasInterruptsOnly(exit.cause)) {
      const error = new Error("The request was cancelled");
      error.name = "AbortError";
      throw error;
    }
    const error = fetchFailure ?? Cause.squash(exit.cause);
    if (error instanceof Error) {
      options.onError?.(error);
    }
    throw error;
  }
  return { call };
};

export type ProductClient = ReturnType<typeof createRpcClient>;
