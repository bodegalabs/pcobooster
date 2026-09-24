import { rosterPersonSchema } from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import type { SelectedPlanMatchContext } from "@pcobooster/api/modules/planning-center/people/types";
import { recoverUnlessInterrupted } from "@pcobooster/api/planning-center/recover-unless-interrupted";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { findIncluded } from "@pcobooster/api/planning-center/utils";
import { blockoutCoversPlanSortInstant } from "@pcobooster/planning-center-models/calendar-day";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type {
  Blockout,
  PCResource,
  PersonWithAvailability,
  RawPerson,
  ScheduleFrequency,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

export const getDefaultFrequency = (): ScheduleFrequency => ({
  recentServedDays: 0,
  last60Days: 0,
  last90Days: 0,
  recentRehearsalOnlyDays: 0,
  rehearsalLast60Days: 0,
  rehearsalLast90Days: 0,
  totalServed: 0,
  totalRehearsals: 0,
  upcomingServices: 0,
  upcomingRehearsals: 0,
});

export const createBasePerson = (
  rawPerson: RawPerson
): PersonWithAvailability => ({
  id: rawPerson.id,
  firstName: rawPerson.attributes.first_name,
  lastName: rawPerson.attributes.last_name,
  fullName:
    `${rawPerson.attributes.first_name} ${rawPerson.attributes.last_name}`.trim(),
  photoUrl: rawPerson.attributes.photo_url,
  photoThumbnailUrl: rawPerson.attributes.photo_thumbnail_url,
  archived: isNonEmptyString(rawPerson.attributes.archived_at),
  positions: [],
  isScheduledForSelectedPlanPosition: false,
  isConfirmedForSelectedPlanPosition: false,
  isDeclinedForSelectedPlanPosition: false,
  selectedPlanAssignmentLabels: [],
});

export const getAssignedPeopleFromAssignments = (
  assignmentsData: PCResource[],
  assignmentsIncluded: PCResource[]
): RawPerson[] => {
  const seenPersonIds = new Set<string>();
  const people: RawPerson[] = [];

  for (const assignment of assignmentsData) {
    const personRel = assignment.relationships?.person?.data;
    const personId = Array.isArray(personRel)
      ? personRel[0]?.id
      : personRel?.id;
    if (!isNonEmptyString(personId) || seenPersonIds.has(personId)) {
      continue;
    }

    const resource = findIncluded(assignmentsIncluded, "Person", personId);
    const parsed = rosterPersonSchema.safeParse(resource);
    if (!parsed.success) {
      continue;
    }

    seenPersonIds.add(personId);
    people.push(parsed.data);
  }

  return people;
};

export const buildSelectedPlanMatchContext = (
  assignmentsIncluded: PCResource[],
  positionId: string,
  teamId?: string,
  planId?: string
): SelectedPlanMatchContext => {
  const selectedPositionResource = findIncluded(
    assignmentsIncluded,
    "TeamPosition",
    positionId
  );
  const selectedPositionName = isString(
    selectedPositionResource?.attributes.name
  )
    ? selectedPositionResource.attributes.name
    : undefined;

  const selectedTeamResource = isNonEmptyString(teamId)
    ? findIncluded(assignmentsIncluded, "Team", teamId)
    : undefined;
  const selectedTeamName = isString(selectedTeamResource?.attributes.name)
    ? selectedTeamResource.attributes.name
    : undefined;

  return {
    planId,
    teamId,
    selectedPositionName,
    selectedTeamName,
  };
};

export const buildServiceTypeNameMap = (
  serviceTypes: PCResource[]
): Map<string, string> => {
  const serviceTypeNameById = new Map<string, string>();
  for (const st of serviceTypes) {
    if (st.type !== "ServiceType") {
      continue;
    }
    serviceTypeNameById.set(
      st.id,
      isString(st.attributes.name) ? st.attributes.name : ""
    );
  }
  return serviceTypeNameById;
};

export const toBlockout = (
  date: PCResource,
  parent: PCResource
): Blockout | null => {
  const startsAt = isString(date.attributes.starts_at_utc)
    ? date.attributes.starts_at_utc
    : date.attributes.starts_at;
  const endsAt = isString(date.attributes.ends_at_utc)
    ? date.attributes.ends_at_utc
    : date.attributes.ends_at;
  if (!isNonEmptyString(startsAt) || !isNonEmptyString(endsAt)) {
    return null;
  }
  const reason = isString(date.attributes.reason)
    ? date.attributes.reason
    : parent.attributes.reason;
  const { description } = parent.attributes;
  const timeZone = isString(date.attributes.time_zone)
    ? date.attributes.time_zone
    : parent.attributes.time_zone;
  const { share } = date.attributes;
  return {
    id: date.id,
    reason: isString(reason) ? reason : "",
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    description: isString(description) ? description : "",
    share:
      share === true || (share !== false && parent.attributes.share === true),
    timeZone: isString(timeZone) ? timeZone : null,
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Covers any blockout time zone offset around a date-only `repeat_until`. */
const REPEAT_UNTIL_MARGIN_MS = 2 * DAY_MS;

/**
 * A repeating blockout's last occurrence starts on `repeat_until` (a date in the blockout's own
 * zone) and lasts as long as the first occurrence, so it cannot touch a plan more than that long
 * after `repeat_until`. Anything unreadable is treated as possibly covering.
 */
export const repeatingBlockoutMayCover = (
  parent: PCResource,
  planSortAt: Date
): boolean => {
  const repeatUntil = parent.attributes.repeat_until;
  if (!isNonEmptyString(repeatUntil)) {
    return true;
  }
  const untilMs = Date.parse(`${repeatUntil.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(untilMs)) {
    return true;
  }
  const { starts_at: startsAt, ends_at: endsAt } = parent.attributes;
  const occurrenceMs =
    isString(startsAt) && isString(endsAt)
      ? Date.parse(endsAt) - Date.parse(startsAt)
      : 0;
  const lengthMs =
    Number.isNaN(occurrenceMs) || occurrenceMs < 0 ? 0 : occurrenceMs;
  return (
    planSortAt.getTime() <= untilMs + DAY_MS + lengthMs + REPEAT_UNTIL_MARGIN_MS
  );
};

/**
 * Blockouts only matter for a selected plan; unreadable blockouts mean none. Every blockout is
 * read (Planning Center's `future` filter is not verified for repeating blockouts), but dates of
 * repeating blockouts that ended before the plan are not.
 */
export const loadPersonBlockouts = (
  personId: string,
  planSortAt: Date | null,
  peopleService: Pick<
    PlanningCenterPeopleService,
    "getPersonBlockouts" | "getPersonBlockoutDates"
  >
): Effect.Effect<Blockout[]> => {
  if (!planSortAt) {
    return Effect.succeed([]);
  }

  return peopleService.getPersonBlockouts(personId, {}).pipe(
    Effect.flatMap((rawBlockouts) =>
      Effect.forEach(
        rawBlockouts,
        (parent) => {
          const frequency = parent.attributes.repeat_frequency;
          if (frequency === undefined || frequency === "no_repeat") {
            return Effect.succeed([{ date: parent, parent }]);
          }
          if (!repeatingBlockoutMayCover(parent, planSortAt)) {
            return Effect.succeed([]);
          }
          return Effect.map(
            peopleService.getPersonBlockoutDates(personId, parent.id),
            (dates) => dates.map((date) => ({ date, parent }))
          );
        },
        { concurrency: "unbounded" }
      )
    ),
    Effect.map((blockoutGroups) => {
      const blockouts: Blockout[] = [];
      for (const group of blockoutGroups) {
        for (const { date, parent } of group) {
          const blockout = toBlockout(date, parent);
          if (blockout !== null) {
            blockouts.push(blockout);
          }
        }
      }
      return blockouts;
    }),
    recoverUnlessInterrupted((): Blockout[] => [])
  );
};

export const applyAvailability = (
  person: PersonWithAvailability,
  blockouts: Blockout[],
  planSortAt: Date | null
) => {
  const isBlocked = planSortAt
    ? blockouts.some((blockout) =>
        blockoutCoversPlanSortInstant(planSortAt, blockout)
      )
    : false;

  person.isBlockedForDate = isBlocked;
  person.availability = isBlocked ? "blocked" : "available";
};
