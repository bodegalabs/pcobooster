import {
  parseRequestId,
  REQUEST_ID_HEADER,
} from "@pcobooster/contracts/http/request-diagnostics";
import { Context, Effect } from "effect";

export interface RequestContextValue {
  /**
   * The unmodified transport request. Application adapters use this only at
   * request-scoped seams such as Better Auth account resolution; feature modules
   * should prefer the normalized fields below.
   */
  readonly request: Request;
  readonly headers: Headers;
  readonly requestId: string;
  readonly method: string;
  readonly url: string;
  readonly signal: AbortSignal;
  readonly metadata: {
    readonly userAgent: string | null;
  };
}

export class RequestContext extends Context.Service<
  RequestContext,
  RequestContextValue
>()("@pcobooster/api/RequestContext") {}

/**
 * A client's `x-request-id` is kept only when it follows the shared grammar (letters, digits,
 * and dashes, 8 to 64 long), so it can join a client report to this request's log line without
 * letting a client write arbitrary text into the logs; anything else gets a fresh UUID.
 */
export const createRequestContext = (request: Request): RequestContextValue => {
  const requestedId = parseRequestId(request.headers.get(REQUEST_ID_HEADER));
  return {
    request,
    headers: new Headers(request.headers),
    requestId: requestedId ?? crypto.randomUUID(),
    method: request.method,
    url: request.url,
    signal: request.signal,
    metadata: {
      userAgent: request.headers.get("user-agent"),
    },
  };
};

/** Prevents a delayed preflight from starting a write after disconnect. */
export const ensureRequestIsOpen: Effect.Effect<void, never, RequestContext> =
  Effect.gen(function* ensureOpenRequest() {
    const { signal } = yield* RequestContext;
    if (signal.aborted) {
      yield* Effect.interrupt;
    }
  });
