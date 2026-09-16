import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import type { Blockout, RawBlockout } from "@/lib/types";

export async function getFutureBlockoutsForPerson(
  personId: string
): Promise<Blockout[]> {
  const rawBlockouts =
    await planningCenterPeopleService.getPersonBlockouts(personId);
  const now = new Date();

  return rawBlockouts
    .map((rawBlockout) => {
      const blockout = rawBlockout as unknown as RawBlockout;
      return {
        id: blockout.id,
        reason: blockout.attributes.reason || "",
        startsAt: new Date(blockout.attributes.starts_at),
        endsAt: new Date(blockout.attributes.ends_at),
        description: blockout.attributes.description || "",
        share: blockout.attributes.share,
        timeZone: blockout.attributes.time_zone ?? null,
      };
    })
    .filter((blockout) => blockout.endsAt >= now);
}
