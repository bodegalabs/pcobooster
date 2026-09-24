import type { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import type { ServerDependencies } from "@pcobooster/api/server";

export interface RpcContext {
  readonly request: Request;
  readonly requestId: string;
  readonly resHeaders?: Headers;
  readonly server: ServerDependencies;
  /** Set per procedure by the middleware in `implementation.ts`. */
  readonly planningCenterAccounting?: PlanningCenterRequestAccounting;
}
