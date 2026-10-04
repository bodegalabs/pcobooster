import { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterCatalog } from "@pcobooster/api/application/planning-center/catalog";
import { PlanningCenterPeople } from "@pcobooster/api/application/planning-center/people";
import type { PresentationDependencies } from "@pcobooster/api/modules/planning-center/presentation";
import { Server } from "@pcobooster/api/server";
import { Effect } from "effect";

/** How this request masks people: its access decides whether, the isolate caches the org id. */
export const requestPresentationDependencies: Effect.Effect<
  PresentationDependencies,
  never,
  PlanningCenterAccess | PlanningCenterCatalog | PlanningCenterPeople | Server
> = Effect.gen(function* readPresentationDependencies() {
  const access = yield* PlanningCenterAccess;
  const peopleService = yield* PlanningCenterPeople;
  const catalogService = yield* PlanningCenterCatalog;
  const { moduleReadCaches } = yield* Server;
  return {
    catalog: catalogService,
    people: peopleService,
    isPresentationMode: () => access.presentation,
    getPresentationSeed: () => access.presentationSeed,
    organizationIds: moduleReadCaches.presentationOrganizationIds,
  };
});
