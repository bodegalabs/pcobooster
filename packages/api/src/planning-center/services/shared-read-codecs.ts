import { pcResourceSchema } from "@pcobooster/api/planning-center/resource-schemas";
import type { PlanningCenterPeopleServiceCaches } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import type { SharedReadCodec } from "@pcobooster/api/planning-center/services/shared-read-store";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { z } from "zod";

type CachedValue<Cache> =
  Cache extends PlanningCenterReadCache<infer Value> ? Value : never;

type AllTeamPeople = CachedValue<
  PlanningCenterPeopleServiceCaches["allTeamPeople"]
>;

const resourcesSchema = z.array(pcResourceSchema);

const storedAllTeamPeopleSchema = z.object({
  people: resourcesSchema,
  included: resourcesSchema,
  teamNamesByPersonId: z.array(z.tuple([z.string(), z.array(z.string())])),
});

/** Parses stored text with a schema; anything malformed or unexpected is `null`. */
const parseStored = <Schema extends z.ZodType>(
  schema: Schema,
  stored: string
): z.infer<Schema> | null => {
  try {
    const parsed = schema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** Resources are validated like a fresh Planning Center response. */
export const resourceListCodec: SharedReadCodec<PCResource[]> = {
  encode: (resources) => JSON.stringify(resources),
  decode: (stored) => parseStored(resourcesSchema, stored),
};

/** Team names are a `Map` of `Set`s in memory and entry lists in the store. */
export const allTeamPeopleCodec: SharedReadCodec<AllTeamPeople> = {
  encode: ({ people, included, teamNamesByPersonId }) =>
    JSON.stringify({
      people,
      included,
      teamNamesByPersonId: [...teamNamesByPersonId].map(([personId, names]) => [
        personId,
        [...names],
      ]),
    }),
  decode: (stored) => {
    const parsed = parseStored(storedAllTeamPeopleSchema, stored);
    if (parsed === null) {
      return null;
    }
    return {
      people: parsed.people,
      included: parsed.included,
      teamNamesByPersonId: new Map(
        parsed.teamNamesByPersonId.map(([personId, names]) => [
          personId,
          new Set(names),
        ])
      ),
    };
  },
};
