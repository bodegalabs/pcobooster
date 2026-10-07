import {
  personPlanLimitsSchema,
  personTeamPositionAssignmentSchema,
  rosterPersonSchema,
} from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import { findIncluded } from "@pcobooster/api/planning-center/utils";
import { blockoutCoversPlanSortInstant } from "@pcobooster/planning-center-models/calendar-day";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { SelectedPlanMatchContext } from "@pcobooster/planning-center-models/position-candidates";
import type { SchedulingPreferences } from "@pcobooster/planning-center-models/scheduling-preferences";
import type {
  Blockout,
  PCResource,
  RawPerson,
} from "@pcobooster/planning-center-models/types";

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

/**
 * Each assigned person's scheduling preferences for the position, read from the assignments and
 * their included Services people: the same response that lists the candidates. A person with
 * several assignments to the position keeps the first, as `getAssignedPeopleFromAssignments` does.
 */
export const getSchedulingPreferencesByPerson = (
  assignmentsData: PCResource[],
  assignmentsIncluded: PCResource[]
): Map<string, SchedulingPreferences> => {
  const preferences = new Map<string, SchedulingPreferences>();
  for (const resource of assignmentsData) {
    const parsed = personTeamPositionAssignmentSchema.safeParse(resource);
    const personId = parsed.data?.relationships.person.data?.id;
    if (
      !parsed.success ||
      !isNonEmptyString(personId) ||
      preferences.has(personId)
    ) {
      continue;
    }
    const { attributes, relationships } = parsed.data;
    const limits = personPlanLimitsSchema.safeParse(
      findIncluded(assignmentsIncluded, "Person", personId)
    ).data?.attributes;
    const schedulePreference = attributes.schedule_preference;
    preferences.set(personId, {
      schedulePreference,
      preferredWeeks:
        schedulePreference === "Choose Weeks" ? attributes.preferred_weeks : [],
      timePreferenceOptionIds: relationships.time_preference_options,
      maxPlansPerDay: limits?.preferred_max_plans_per_day ?? null,
      maxPlansPerMonth: limits?.preferred_max_plans_per_month ?? null,
    });
  }
  return preferences;
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

export const isRepeatingBlockout = (parent: PCResource): boolean => {
  const frequency = parent.attributes.repeat_frequency;
  return frequency !== undefined && frequency !== "no_repeat";
};

/**
 * Whether a blockout date (a one-time blockout, or a date a repeating one generated) touches
 * the plan's calendar day in the blockout's own time zone, falling back to its parent's.
 */
export const blockoutDateCoversPlanDate = (
  date: PCResource,
  parentTimeZone: string | null,
  planSortAt: Date
): boolean => {
  const blockout = toBlockout(date, {
    type: "Blockout",
    id: date.id,
    attributes: { time_zone: parentTimeZone },
  });
  return (
    blockout !== null && blockoutCoversPlanSortInstant(planSortAt, blockout)
  );
};
