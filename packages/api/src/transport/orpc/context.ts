import type { ServerDependencies } from "@pcobooster/api/server";

export interface RpcContext {
  readonly request: Request;
  readonly requestId: string;
  readonly resHeaders?: Headers;
  readonly server: ServerDependencies;
}
