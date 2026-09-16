import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { findIncluded } from "@/lib/planning-center/utils";
import type {
  Blockout,
  PCResource,
  PersonWithAvailability,
  RawBlockout,
  RawPerson,
  RawServiceType,
  ScheduleFrequency,
} from "@/lib/types";
import { blockoutCoversPlanSortInstant } from "@/lib/use-cases/planning-center/people/calendar-day";
import type { SelectedPlanMatchContext } from "@/lib/use-cases/planning-center/people/types";

export function getDefaultFrequency(): ScheduleFrequency {
  return {
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
  };
}

export function createBasePerson(rawPerson: RawPerson): PersonWithAvailability {
  return {
    id: rawPerson.id,
    firstName: (rawPerson.attributes.first_name as string) || "",
    lastName: (rawPerson.attributes.last_name as string) || "",
    fullName:
      `${rawPerson.attributes.first_name || ""} ${rawPerson.attributes.last_name || ""}`.trim(),
    photoUrl: (rawPerson.attributes.photo_url as string) || null,
    photoThumbnailUrl:
      (rawPerson.attributes.photo_thumbnail_url as string) || null,
    archived: !!rawPerson.attributes.archived_at,
    positions: [],
    isScheduledForSelectedPlanPosition: false,
    isConfirmedForSelectedPlanPosition: false,
    isDeclinedForSelectedPlanPosition: false,
    selectedPlanAssignmentLabels: [],
  };
}

export function getAssignedPeopleFromAssignments(
  assignmentsData: PCResource[],
  assignmentsIncluded: PCResource[]
): RawPerson[] {
  const seenPersonIds = new Set<string>();
  const people: RawPerson[] = [];

  for (const assignment of assignmentsData) {
    const personRel = assignment.relationships?.person?.data;
    const personId = Array.isArray(personRel)
      ? personRel[0]?.id
      : personRel?.id;
    if (!personId || seenPersonIds.has(personId)) continue;

    const person = findIncluded(assignmentsIncluded, "Person", personId) as
      | RawPerson
      | undefined;
    if (!person) continue;

    seenPersonIds.add(personId);
    people.push(person);
  }

  return people;
}

export function buildSelectedPlanMatchContext(
  assignmentsIncluded: PCResource[],
  positionId: string,
  teamId?: string,
  planId?: string
): SelectedPlanMatchContext {
  const selectedPositionResource = findIncluded(
    assignmentsIncluded,
    "TeamPosition",
    positionId
  ) as unknown as { attributes?: { name?: string } } | undefined;
  const selectedPositionName = selectedPositionResource?.attributes?.name;

  const selectedTeamResource = teamId
    ? (findIncluded(assignmentsIncluded, "Team", teamId) as unknown as
        | {
            attributes?: { name?: string };
          }
        | undefined)
    : undefined;

  return {
    planId,
    teamId,
    selectedPositionName,
    selectedTeamName: selectedTeamResource?.attributes?.name,
  };
}

export function buildServiceTypeNameMap(
  serviceTypes: PCResource[]
): Map<string, string> {
  const serviceTypeNameById = new Map<string, string>();
  serviceTypes.forEach((st) => {
    if (st.type !== "ServiceType") return;
    const typed = st as unknown as RawServiceType;
    serviceTypeNameById.set(typed.id, (typed.attributes.name as string) || "");
  });
  return serviceTypeNameById;
}

export function buildBlockoutsPromise(
  personId: string,
  planSortAt: Date | null
): Promise<Blockout[]> {
  if (!planSortAt) return Promise.resolve([]);

  return planningCenterPeopleService
    .getPersonBlockouts(personId)
    .then((rawBlockouts) =>
      rawBlockouts.map((raw) => {
        const blockout = raw as unknown as RawBlockout;
        return {
          id: blockout.id,
          reason: blockout.attributes.reason || "",
          startsAt: new Date(blockout.attributes.starts_at as string),
          endsAt: new Date(blockout.attributes.ends_at as string),
          description: blockout.attributes.description || "",
          share: blockout.attributes.share,
          timeZone: blockout.attributes.time_zone ?? null,
        };
      })
    )
    .catch(() => []);
}

export function applyAvailability(
  person: PersonWithAvailability,
  blockouts: Blockout[],
  planSortAt: Date | null
) {
  const isBlocked = planSortAt
    ? blockouts.some((blockout) =>
        blockoutCoversPlanSortInstant(planSortAt, blockout)
      )
    : false;

  person.isBlockedForDate = isBlocked;
  person.availability = isBlocked ? "blocked" : "available";
}
