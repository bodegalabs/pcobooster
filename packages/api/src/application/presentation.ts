import { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import type { PresentationDependencies } from "@pcobooster/api/modules/planning-center/presentation";
import { Server } from "@pcobooster/api/server";
import { Effect } from "effect";

/** How this request masks people: its access decides whether, the isolate caches the org id. */
export const requestPresentationDependencies: Effect.Effect<
  PresentationDependencies,
  never,
  PlanningCenterAccess | Server
> = Effect.gen(function* readPresentationDependencies() {
  const access = yield* PlanningCenterAccess;
  const { moduleReadCaches } = yield* Server;
  return {
    catalog: access.services.catalog,
    people: access.services.people,
    isPresentationMode: () => access.presentation,
    getPresentationSeed: () => access.presentationSeed,
    organizationIds: moduleReadCaches.presentationOrganizationIds,
  };
});
