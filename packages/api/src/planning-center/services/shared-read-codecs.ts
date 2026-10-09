import { pcResourcesSchema } from "@pcobooster/api/planning-center/resource-schemas";
import type { PlanningCenterPeopleServiceCaches } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import type { SharedReadCodec } from "@pcobooster/api/planning-center/services/shared-read-store";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Option, Schema } from "effect";

type CachedValue<Cache> =
  Cache extends PlanningCenterReadCache<infer Value> ? Value : never;

type AllTeamPeople = CachedValue<
  PlanningCenterPeopleServiceCaches["allTeamPeople"]
>;

const storedAllTeamPeopleSchema = Schema.Struct({
  people: pcResourcesSchema,
  included: pcResourcesSchema,
  teams: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        serviceTypeName: Schema.NullOr(Schema.String),
        personIds: Schema.mutable(Schema.Array(Schema.String)),
        leaderPersonIds: Schema.mutable(Schema.Array(Schema.String)),
      })
    )
  ),
});

/**
 * Stored JSON text read through `schema`; anything malformed or unexpected is `null`. Values are
 * written as plain JSON, which these schemas' encoded forms are.
 */
const storedCodec = <Value>(
  schema: Schema.Codec<Value, unknown>
): SharedReadCodec<Value> => {
  const decode = Schema.decodeUnknownOption(Schema.fromJsonString(schema));
  return {
    encode: (value) => JSON.stringify(value),
    decode: (stored) => Option.getOrNull(decode(stored)),
  };
};

/** Resources are validated like a fresh Planning Center response. */
export const resourceListCodec: SharedReadCodec<PCResource[]> =
  storedCodec(pcResourcesSchema);

export const allTeamPeopleCodec: SharedReadCodec<AllTeamPeople> = storedCodec(
  storedAllTeamPeopleSchema
);
