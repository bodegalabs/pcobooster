import type { ApplicationRuntime } from "@pcobooster/api/application/runtime";
import type { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import type { ServerDependencies } from "@pcobooster/api/server";
import type { HttpClient } from "effect/http/HttpClient";

export interface RpcContext {
  readonly request: Request;
  readonly onUnexpectedError?: (
    error: Error,
    procedure?: string
  ) => Promise<void>;
  readonly requestId: string;
  readonly resHeaders?: Headers;
  readonly server: ServerDependencies;
  /** Runs this request's programs on the Worker's request fiber; see `applicationRuntimeFor`. */
  readonly runtime: ApplicationRuntime<HttpClient>;
  /** The Effect RPC procedure path, set by the middleware in `implementation.ts`. */
  readonly procedure?: string;
  /** Set per procedure by the middleware in `implementation.ts`. */
  readonly planningCenterAccounting?: PlanningCenterRequestAccounting;
}
