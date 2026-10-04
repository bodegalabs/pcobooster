import type { RequestPlanningCenterServices } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterCatalog } from "@pcobooster/api/application/planning-center/catalog";
import { OrganizationTimeZone } from "@pcobooster/api/application/planning-center/organization-time-zone";
import { PlanningCenterPeople } from "@pcobooster/api/application/planning-center/people";
import { PlanningCenterPlanItems } from "@pcobooster/api/application/planning-center/plan-items";
import { PlanningCenterPlans } from "@pcobooster/api/application/planning-center/plans";
import { PlanningCenterProductAccess } from "@pcobooster/api/application/planning-center/product-access";
import { PlanningCenterSongs } from "@pcobooster/api/application/planning-center/songs";
import { Context } from "effect";

/**
 * Each Planning Center capability is its own service, bound to the request's credential by
 * `provideAccess`. A program's requirements name exactly the capabilities it reads, and a test
 * provides only those.
 */
export type PlanningCenterServices =
  | PlanningCenterPeople
  | PlanningCenterCatalog
  | PlanningCenterPlans
  | PlanningCenterPlanItems
  | PlanningCenterSongs
  | PlanningCenterProductAccess
  | OrganizationTimeZone;

/** Every capability of one request's Planning Center services. */
export const planningCenterServicesContext = (
  services: RequestPlanningCenterServices
): Context.Context<PlanningCenterServices> =>
  Context.make(PlanningCenterPeople, services.people).pipe(
    Context.add(PlanningCenterCatalog, services.catalog),
    Context.add(PlanningCenterPlans, services.plans),
    Context.add(PlanningCenterPlanItems, services.planItems),
    Context.add(PlanningCenterSongs, services.songs),
    Context.add(PlanningCenterProductAccess, services.access),
    Context.add(OrganizationTimeZone, services.organizationTimeZone)
  );
