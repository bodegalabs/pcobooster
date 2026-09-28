import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { recoverPlanningCenterFailure } from "@pcobooster/api/planning-center/recover-failure";
import type { PlanningCenterAccessService } from "@pcobooster/api/planning-center/services/access-service";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import { servicesPermissionLevelSchema } from "@pcobooster/planning-center-models/access";
import type {
  PeopleAccess,
  PlanningCenterAccessSnapshot,
  ServicesAccess,
} from "@pcobooster/planning-center-models/access";
import {
  isNonEmptyString,
  isNumber,
} from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { z } from "zod";

export interface AccessSnapshotDependencies {
  readonly accessService: Pick<
    PlanningCenterAccessService,
    "getServicesMe" | "getTeamLeaders" | "probePeopleDirectory"
  >;
  readonly catalogService: Pick<
    PlanningCenterCatalogService,
    "getServiceTypesCached"
  >;
}

/**
 * Runs a read, reporting a denial as `null`. Planning Center answers 401 `TRASH_PANDA`
 * when the person has no access to a product, and 403 when their role is too low to read
 * the resource; every other failure, including a rejected token, propagates.
 */
const orDenied = <Value>(
  effect: Effect.Effect<Value, PlanningCenterError>,
  read: string
): Effect.Effect<Value | null, PlanningCenterError> =>
  effect.pipe(
    recoverPlanningCenterFailure({
      kinds: ["permission-denied"],
      reason: "Planning Center denied an access read; the person lacks it",
      details: { read },
      fallback: () => null,
    })
  );

/** A flag Planning Center may leave out; anything but `true` means no. */
const flagSchema = z
  .union([z.literal(true), z.json().transform(() => false)])
  .optional()
  .transform((flag) => flag ?? false);

/**
 * Services `Person` permission fields. `permissions` and `max_permissions` are the
 * deprecated names for the plan levels, kept as fallbacks.
 */
const servicesPersonSchema = z.object({
  site_administrator: flagSchema,
  plan_permissions: servicesPermissionLevelSchema,
  permissions: servicesPermissionLevelSchema,
  max_plan_permissions: servicesPermissionLevelSchema,
  max_permissions: servicesPermissionLevelSchema,
  song_permissions: servicesPermissionLevelSchema,
  can_view_all_people: flagSchema,
});

/** `permissions` is the person's level in that service type (undocumented values). */
const serviceTypeSchema = z.object({
  name: z
    .union([z.string(), z.json().transform(() => "")])
    .optional()
    .transform((name) => name ?? ""),
  permissions: servicesPermissionLevelSchema,
});

const sortedActiveServiceTypes = (
  rawServiceTypes: readonly PCResource[]
): PCResource[] =>
  rawServiceTypes
    .filter((raw) => !isNonEmptyString(raw.attributes.archived_at))
    .toSorted(
      (a, b) =>
        (isNumber(a.attributes.sequence) ? a.attributes.sequence : 0) -
        (isNumber(b.attributes.sequence) ? b.attributes.sequence : 0)
    );

const readServicesAccess = (
  dependencies: AccessSnapshotDependencies
): Effect.Effect<ServicesAccess, PlanningCenterError> =>
  Effect.gen(function* readServices() {
    const me = yield* orDenied(
      dependencies.accessService.getServicesMe(),
      "services-me"
    );
    if (me === null) {
      return { status: "none" } as const;
    }
    const [teamLeaders, rawServiceTypes] = yield* Effect.all(
      [
        orDenied(
          dependencies.accessService.getTeamLeaders(me.id),
          "team-leaders"
        ),
        orDenied(
          dependencies.catalogService.getServiceTypesCached(),
          "service-types"
        ),
      ],
      { concurrency: "unbounded" }
    );
    const person = servicesPersonSchema.parse(me.attributes);
    return {
      status: "granted",
      organizationAdministrator: person.site_administrator,
      planLevel: person.plan_permissions ?? person.permissions,
      maxPlanLevel: person.max_plan_permissions ?? person.max_permissions,
      songLevel: person.song_permissions,
      canViewAllPeople: person.can_view_all_people,
      ledTeamCount: new Set(
        (teamLeaders ?? []).map((leader) => {
          const team = leader.relationships?.team?.data;
          return team && !Array.isArray(team) ? team.id : leader.id;
        })
      ).size,
      serviceTypes: sortedActiveServiceTypes(rawServiceTypes ?? []).map(
        (raw) => {
          const serviceType = serviceTypeSchema.parse(raw.attributes);
          return {
            id: raw.id,
            name: serviceType.name,
            level: serviceType.permissions,
          };
        }
      ),
    };
  });

const readPeopleAccess = (
  dependencies: AccessSnapshotDependencies
): Effect.Effect<PeopleAccess, PlanningCenterError> =>
  Effect.map(
    orDenied(
      dependencies.accessService.probePeopleDirectory(),
      "people-directory"
    ),
    (people) => (people === null ? { status: "none" } : { status: "granted" })
  );

/**
 * Reads the person's Services permissions and whether they can search People: usually four
 * Planning Center requests (the service types list is cached; uncached, it pages). Denials
 * become "no access"; other failures, such as rate limits, fail the read so the product
 * never guesses.
 */
export const getAccessSnapshot = (
  dependencies: AccessSnapshotDependencies
): Effect.Effect<PlanningCenterAccessSnapshot, PlanningCenterError> =>
  Effect.map(
    Effect.all(
      [readServicesAccess(dependencies), readPeopleAccess(dependencies)],
      { concurrency: "unbounded" }
    ),
    ([services, people]) => ({ services, people })
  );
