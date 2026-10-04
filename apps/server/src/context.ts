import type { ApplicationRuntime } from "@pcobooster/api/application/runtime";
import { serverDependenciesForRequest } from "@pcobooster/api/server";
import type { ServerDependencies } from "@pcobooster/api/server";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";
import type { HttpClient } from "effect/unstable/http/HttpClient";

export const createContext = ({
  request,
  runtime,
  server,
}: {
  request: Request;
  runtime: ApplicationRuntime<HttpClient>;
  server: ServerDependencies;
}): RpcContext => {
  const requestedId = request.headers.get("x-request-id")?.trim();
  return {
    request,
    requestId:
      requestedId !== undefined && requestedId !== ""
        ? requestedId
        : crypto.randomUUID(),
    runtime,
    server: serverDependenciesForRequest(server),
  };
};
