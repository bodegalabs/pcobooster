import { RpcError } from "@pcobooster/contracts/errors";
import { SERVICES_PERMISSION_LEVELS } from "@pcobooster/planning-center-models/access";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const servicesLevelSchema = Schema.NullOr(
  Schema.Literals(SERVICES_PERMISSION_LEVELS)
);

export const servicesAccessSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("none") }).mapFields(
    Struct.map(Schema.mutableKey)
  ),
  Schema.Struct({
    status: Schema.Literal("granted"),
    organizationAdministrator: Schema.Boolean,
    planLevel: servicesLevelSchema,
    maxPlanLevel: servicesLevelSchema,
    songLevel: servicesLevelSchema,
    canViewAllPeople: Schema.Boolean,
    ledTeamCount: Schema.Finite.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0)
    ),
    serviceTypes: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          level: servicesLevelSchema,
        }).mapFields(Struct.map(Schema.mutableKey))
      )
    ),
  }).mapFields(Struct.map(Schema.mutableKey)),
]);

export const peopleAccessSchema = Schema.Struct({
  status: Schema.Literals(["none", "granted"]),
}).mapFields(Struct.map(Schema.mutableKey));

export const accessSnapshotSchema = Schema.Struct({
  services: servicesAccessSchema,
  people: peopleAccessSchema,
}).mapFields(Struct.map(Schema.mutableKey));

export const accessInputSchema = Schema.Struct({}).mapFields(
  Struct.map(Schema.mutableKey)
);

export const accessRpc = RpcGroup.make(
  Rpc.make("access.me", {
    payload: accessInputSchema,
    success: accessSnapshotSchema,
    error: RpcError,
  })
);

export type AccessSnapshot = typeof accessSnapshotSchema.Type;
