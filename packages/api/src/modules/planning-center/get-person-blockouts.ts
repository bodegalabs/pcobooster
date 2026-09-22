import { toBlockout } from "@pcobooster/api/modules/planning-center/people/transforms";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { Blockout } from "@pcobooster/planning-center-models/types";

export interface FutureBlockoutsDependencies {
  readonly peopleService: Pick<
    PlanningCenterPeopleService,
    "getPersonBlockouts"
  >;
}

export const getFutureBlockoutsForPerson = async (
  personId: string,
  dependencies: FutureBlockoutsDependencies,
  signal?: AbortSignal
): Promise<Blockout[]> => {
  const rawBlockouts = await dependencies.peopleService.getPersonBlockouts(
    personId,
    {},
    signal
  );
  const now = new Date();

  const blockouts: Blockout[] = [];
  for (const rawBlockout of rawBlockouts) {
    const blockout = toBlockout(rawBlockout, rawBlockout);
    if (blockout !== null && blockout.endsAt >= now) {
      blockouts.push(blockout);
    }
  }
  return blockouts;
};
