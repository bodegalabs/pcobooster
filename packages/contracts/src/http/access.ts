/** What the caller may do in Planning Center. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  mutableArray,
  nonNegativeInteger,
} from "@pcobooster/contracts/http/schema";
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

export const access = planningCenterGroup(
  "access",
  read("me", "/access/me", {
    success: accessSnapshotSchema,
  })
);

export type AccessSnapshot = typeof accessSnapshotSchema.Type;
