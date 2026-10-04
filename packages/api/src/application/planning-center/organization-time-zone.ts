import type { RequestPlanningCenterServices } from "@pcobooster/api/application/planning-center-access";
import { Context } from "effect";

/** The organization's IANA zone, or the configured fallback; cached per isolate. */
export class OrganizationTimeZone extends Context.Service<
  OrganizationTimeZone,
  RequestPlanningCenterServices["organizationTimeZone"]
>()("@pcobooster/api/OrganizationTimeZone") {}
