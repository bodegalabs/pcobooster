import { isNonEmptyString, isString } from "@worship-admin/api/json";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { findIncluded } from "@worship-admin/api/planning-center/utils";
import type {
  Blockout,
  PCResource,
  PersonWithAvailability,
  RawPerson,
  ScheduleFrequency,
} from "@worship-admin/api/types";
import { blockoutCoversPlanSortInstant } from "@worship-admin/api/use-cases/planning-center/people/calendar-day";
import { rosterPersonSchema } from "@worship-admin/api/use-cases/planning-center/people/resource-schemas";
import type { SelectedPlanMatchContext } from "@worship-admin/api/use-cases/planning-center/people/types";

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

export const buildBlockoutsPromise = async (
  personId: string,
  planSortAt: Date | null,
  peopleService: Pick<
    typeof planningCenterPeopleService,
    "getPersonBlockouts" | "getPersonBlockoutDates"
  > = planningCenterPeopleService
): Promise<Blockout[]> => {
  if (!planSortAt) {
    return [];
  }

  try {
    const rawBlockouts = await peopleService.getPersonBlockouts(personId);
    const blockoutGroups = await Promise.all(
      rawBlockouts.map(async (parent) => {
        const frequency = parent.attributes.repeat_frequency;
        if (frequency === undefined || frequency === "no_repeat") {
          return [{ date: parent, parent }];
        }
        const dates = await peopleService.getPersonBlockoutDates(
          personId,
          parent.id
        );
        return dates.map((date) => ({ date, parent }));
      })
    );

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
  } catch {
    return [];
  }
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
