import { toBlockout } from "@pcobooster/api/modules/planning-center/people/transforms";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { Blockout } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

export interface FutureBlockoutsDependencies {
  readonly peopleService: Pick<
    PlanningCenterPeopleService,
    "getPersonBlockouts"
  >;
}

export const getFutureBlockoutsForPerson = (
  personId: string,
  dependencies: FutureBlockoutsDependencies
): Effect.Effect<Blockout[], PlanningCenterError> =>
  Effect.map(
    dependencies.peopleService.getPersonBlockouts(personId, {}),
    (rawBlockouts) => {
      const now = new Date();
      const blockouts: Blockout[] = [];
      for (const rawBlockout of rawBlockouts) {
        const blockout = toBlockout(rawBlockout, rawBlockout);
        if (blockout !== null && blockout.endsAt >= now) {
          blockouts.push(blockout);
        }
      }
      return blockouts;
    }
  );
