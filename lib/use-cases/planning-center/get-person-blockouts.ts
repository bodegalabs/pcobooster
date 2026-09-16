import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import type { Blockout } from "@/lib/types";
import { toBlockout } from "@/lib/use-cases/planning-center/people/transforms";

export const getFutureBlockoutsForPerson = async (
  personId: string
): Promise<Blockout[]> => {
  const rawBlockouts =
    await planningCenterPeopleService.getPersonBlockouts(personId);
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
