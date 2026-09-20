import { Context } from "effect";

export interface RequestContextValue {
  /**
   * The unmodified transport request. Application adapters use this only at
   * request-scoped seams such as Better Auth account resolution; use cases
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

export class RequestContext extends Context.Tag(
  "@worship-admin/api/RequestContext"
)<RequestContext, RequestContextValue>() {}

export const createRequestContext = (request: Request): RequestContextValue => {
  const requestedId = request.headers.get("x-request-id")?.trim();
  return {
    request,
    headers: new Headers(request.headers),
    requestId:
      requestedId !== undefined && requestedId !== ""
        ? requestedId
        : crypto.randomUUID(),
    method: request.method,
    url: request.url,
    signal: request.signal,
    metadata: {
      userAgent: request.headers.get("user-agent"),
    },
  };
};
