import { ensureRequestIsOpen } from "@pcobooster/api/application/context";
import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import {
  PlanningCenterAccess,
  withPlanningCenterFaults,
} from "@pcobooster/api/application/planning-center-access";
import { adjustNeededPositions } from "@pcobooster/api/modules/planning-center/adjust-needed-positions";
import type { NeededPositionsAdjustInput } from "@pcobooster/contracts/needed-positions";
import { Effect } from "effect";

export const adjustPlanNeededPositions = (
  input: NeededPositionsAdjustInput
): Effect.Effect<
  { openCount: number },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* adjustPlanOpenSlots() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    return yield* adjustNeededPositions(input, {
      catalogService: access.services.catalog,
    });
  }).pipe(withPlanningCenterFaults);
