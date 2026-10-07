/**
 * The services the product API's middlewares provide, named for the contracts by module
 * augmentation (`@pcobooster/contracts/http/server-services`): `ProcedureScope` provides the
 * request's identity, server, accounting, HTTP client, and response cookies to every endpoint;
 * `PlanningCenterSession` provides the caller's Planning Center capabilities. Imported for its
 * augmentation by every module that builds handlers or middleware.
 */
import type { RequestContext } from "@pcobooster/api/application/context";
import type { PlanningCenterRequest } from "@pcobooster/api/application/planning-center-access";
import type { ResponseCookies } from "@pcobooster/api/http/response-cookies";
import type { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import type { Server } from "@pcobooster/api/server";
import type { HttpClient } from "effect/unstable/http/HttpClient";

declare module "@pcobooster/contracts/http/server-services" {
  interface ServerServices {
    readonly procedure:
      | RequestContext
      | Server
      | PlanningCenterAccounting
      | HttpClient
      | ResponseCookies;
    readonly planningCenter: PlanningCenterRequest;
  }
}
