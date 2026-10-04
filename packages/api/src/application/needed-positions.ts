import { ensureRequestIsOpen } from "@pcobooster/api/application/context";
import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { withPlanningCenterFaults } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterCatalog } from "@pcobooster/api/application/planning-center/catalog";
import { adjustNeededPositions } from "@pcobooster/api/modules/planning-center/adjust-needed-positions";
import type { NeededPositionsAdjustInput } from "@pcobooster/contracts/needed-positions";
import { Effect } from "effect";

export const adjustPlanNeededPositions = (
  input: NeededPositionsAdjustInput
): Effect.Effect<
  { openCount: number },
  ApplicationFault,
  PlanningCenterCatalog | RequestContext
> =>
  Effect.gen(function* adjustPlanOpenSlots() {
    const catalogService = yield* PlanningCenterCatalog;
    yield* ensureRequestIsOpen;
    return yield* adjustNeededPositions(input, {
      catalogService,
    });
  }).pipe(withPlanningCenterFaults);
