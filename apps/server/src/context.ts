import type { RpcContext } from "@pcobooster/api/transport/orpc/context";

export const createContext = ({
  request,
}: {
  request: Request;
}): RpcContext => {
  const requestedId = request.headers.get("x-request-id")?.trim();
  return {
    request,
    requestId:
      requestedId !== undefined && requestedId !== ""
        ? requestedId
        : crypto.randomUUID(),
  };
};
