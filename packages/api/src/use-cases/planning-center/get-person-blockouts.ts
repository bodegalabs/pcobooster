import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { toBlockout } from "@worship-admin/api/use-cases/planning-center/people/transforms";
import type { Blockout } from "@worship-admin/planning-center-models/types";

export interface FutureBlockoutsDependencies {
  readonly peopleService: Pick<
    PlanningCenterPeopleService,
    "getPersonBlockouts"
  >;
}

const defaultDependencies: FutureBlockoutsDependencies = {
  peopleService: planningCenterPeopleService,
};

export const getFutureBlockoutsForPerson = async (
  personId: string,
  dependencies: FutureBlockoutsDependencies = defaultDependencies
): Promise<Blockout[]> => {
  const rawBlockouts =
    await dependencies.peopleService.getPersonBlockouts(personId);
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
