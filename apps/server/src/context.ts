import type { ServerDependencies } from "@pcobooster/api/server";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";

export const createContext = ({
  request,
  server,
}: {
  request: Request;
  server: ServerDependencies;
}): RpcContext => {
  const requestedId = request.headers.get("x-request-id")?.trim();
  return {
    request,
    requestId:
      requestedId !== undefined && requestedId !== ""
        ? requestedId
        : crypto.randomUUID(),
    server,
  };
};
