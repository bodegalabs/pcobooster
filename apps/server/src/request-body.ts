export interface PreparedRequest {
  readonly request: () => Request;
}

/**
 * JSON RPC decoding is lazy. Read its request-owned stream before shared initialization,
 * then construct the handler's Request afterward. Even a Request made from bytes owns a
 * workerd stream, so constructing it before that wait would retain the same lifetime risk.
 * Auth, multipart, and other streaming paths keep their existing handling.
 */
export const prepareRpcRequest = async (
  request: Request
): Promise<PreparedRequest> => {
  const path = new URL(request.url).pathname;
  const contentType = request.headers.get("content-type");
  if (
    request.body === null ||
    !(path === "/api/rpc" || path.startsWith("/api/rpc/")) ||
    (contentType !== null && !contentType.startsWith("application/json"))
  ) {
    return { request: () => request };
  }
  const body = await request.arrayBuffer();
  return {
    request: () => new Request(request, { method: request.method, body }),
  };
};
