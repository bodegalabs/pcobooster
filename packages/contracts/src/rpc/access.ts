/** Access procedures over Effect RPC. Ported from the zod schemas in `../access.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import { read } from "@pcobooster/contracts/rpc/procedure";
import {
  mutableArray,
  nonNegativeInteger,
} from "@pcobooster/contracts/rpc/schema";
import { SERVICES_PERMISSION_LEVELS } from "@pcobooster/planning-center-models/access";
import { Schema } from "effect";

const servicesLevelSchema = Schema.NullOr(
  Schema.Literals(SERVICES_PERMISSION_LEVELS)
);

export const servicesAccessSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("none") }),
  Schema.Struct({
    status: Schema.Literal("granted"),
    organizationAdministrator: Schema.Boolean,
    planLevel: servicesLevelSchema,
    maxPlanLevel: servicesLevelSchema,
    songLevel: servicesLevelSchema,
    canViewAllPeople: Schema.Boolean,
    ledTeamCount: nonNegativeInteger,
    serviceTypes: mutableArray(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        level: servicesLevelSchema,
      })
    ),
  }),
]);

export const peopleAccessSchema = Schema.Struct({
  status: Schema.Literals(["none", "granted"]),
});

export const accessSnapshotSchema = Schema.Struct({
  services: servicesAccessSchema,
  people: peopleAccessSchema,
});

export const accessMe = read("access.me", {
  payload: Schema.Struct({}),
  success: accessSnapshotSchema,
});

export const accessProcedures = [accessMe] as const;
export const accessRpc = planningCenterGroup(...accessProcedures);
