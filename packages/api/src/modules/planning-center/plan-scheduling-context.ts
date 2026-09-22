import { rosterPersonSchema } from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { findIncluded } from "@pcobooster/api/planning-center/utils";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import type {
  PCResource,
  RawPerson,
  RawPlanPerson,
} from "@pcobooster/planning-center-models/types";

export type PlanRosterStatus = "confirmed" | "pending" | "declined";

export interface PlanRosterPerson {
  id: string;
  name: string;
  photoThumbnailUrl: string | null;
  rawPerson?: RawPerson;
}

export interface PlanRosterEntry {
  planPersonId: string;
  personId: string | null;
  person?: PlanRosterPerson;
  teamId: string | null;
  teamName: string | null;
  positionName: string;
  label: string;
  status: PlanRosterStatus;
  rawStatus: string;
  assignedTimeIds: string[];
  serviceTimeIds: string[];
  /** Services `plan_person.decline_reason` when present. */
  declineReason?: string | null;
}

export interface PlanSchedulingContext {
  serviceTypeId: string;
  planId: string;
  rosterEntries: PlanRosterEntry[];
  rosterByPersonId: Map<string, PlanRosterEntry[]>;
  rosterBySlotKey: Map<string, PlanRosterEntry[]>;
  peopleById: Map<string, RawPerson>;
}

interface Params {
  serviceTypeId: string;
  planId: string;
}

const normalizePositionName = (positionName: string): string =>
  positionName.trim().toLowerCase();

export const buildSlotKey = (teamId: string, positionName: string): string =>
  `${teamId}::${normalizePositionName(positionName)}`;

export const emptyPlanSchedulingContext = (
  serviceTypeId: string,
  planId: string
): PlanSchedulingContext => ({
  serviceTypeId,
  planId,
  rosterEntries: [],
  rosterByPersonId: new Map(),
  rosterBySlotKey: new Map(),
  peopleById: new Map(),
});

export const getRosterEntriesForSlot = (
  context: PlanSchedulingContext,
  teamId: string | undefined,
  positionName: string | undefined
): PlanRosterEntry[] => {
  if (!isNonEmptyString(teamId) || !isNonEmptyString(positionName)) {
    return [];
  }
  return context.rosterBySlotKey.get(buildSlotKey(teamId, positionName)) ?? [];
};

export const getRosterEntriesForPerson = (
  context: PlanSchedulingContext,
  personId: string
): PlanRosterEntry[] => context.rosterByPersonId.get(personId) ?? [];

export const getRosterPerson = (
  context: PlanSchedulingContext,
  personId: string
): RawPerson | undefined => context.peopleById.get(personId);

export const isDeclinedRosterStatus = (status: PlanRosterStatus): boolean =>
  status === "declined";

const normalizeDeclineReason = (raw: JsonValue | undefined): string | null => {
  if (!isString(raw)) {
    return null;
  }
  const t = raw.trim();
  return t.length > 0 ? t : null;
};

const classifyRosterStatus = (
  rawStatus: string | undefined
): PlanRosterStatus => {
  const status = (rawStatus ?? "").trim().toLowerCase();
  if (status === "c" || status === "confirmed") {
    return "confirmed";
  }
  if (
    status === "d" ||
    status.includes("declined") ||
    status.includes("removed")
  ) {
    return "declined";
  }
  return "pending";
};

const buildRawPeopleMap = (included: PCResource[]): Map<string, RawPerson> => {
  const result = new Map<string, RawPerson>();
  for (const resource of included) {
    const parsed = rosterPersonSchema.safeParse(resource);
    if (parsed.success) {
      result.set(parsed.data.id, parsed.data);
    }
  }
  return result;
};

const getPersonName = (person: RawPerson): string => {
  const firstName = (person.attributes.first_name || "").trim();
  const lastName = (person.attributes.last_name || "").trim();
  return (
    [firstName, lastName].filter(Boolean).join(" ").trim() || "Unknown person"
  );
};

const getTeamName = (
  included: PCResource[],
  teamId: string | null
): string | null => {
  if (!isNonEmptyString(teamId)) {
    return null;
  }
  const team = findIncluded(included, "Team", teamId);
  return isString(team?.attributes.name)
    ? team.attributes.name.trim() || null
    : null;
};

const removeKnownTeamPrefix = (
  positionName: string,
  teamName: string | null
): string => {
  if (!isNonEmptyString(teamName)) {
    return positionName;
  }
  const prefix = `${teamName} - `;
  return positionName.startsWith(prefix)
    ? positionName.slice(prefix.length).trim() || positionName
    : positionName;
};

const buildRosterLabel = (
  rawPositionName: string,
  positionName: string,
  teamName: string | null
): string => {
  if (!isNonEmptyString(teamName)) {
    return rawPositionName;
  }
  const prefix = `${teamName} - `;
  return rawPositionName.startsWith(prefix)
    ? rawPositionName
    : `${teamName} - ${positionName}`;
};

const getRelationshipId = (
  data: { id: string } | { id: string }[] | null | undefined
): string | null => {
  if (!data || Array.isArray(data)) {
    return null;
  }
  return data.id || null;
};

const getRelationshipIds = (
  data: { id: string } | { id: string }[] | null | undefined
): string[] => {
  const ids: string[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (isNonEmptyString(item.id)) {
        ids.push(item.id);
      }
    }
  }
  return ids;
};

const normalizeRosterEntry = (
  member: PCResource | RawPlanPerson,
  included: PCResource[],
  peopleById: Map<string, RawPerson>
): PlanRosterEntry | null => {
  const rawPositionName = isString(member.attributes.team_position_name)
    ? member.attributes.team_position_name.trim()
    : "";
  if (!rawPositionName) {
    return null;
  }

  const rawStatus = isString(member.attributes.status)
    ? member.attributes.status
    : "";
  const status = classifyRosterStatus(rawStatus);
  const relationshipTeamId = getRelationshipId(
    member.relationships?.team?.data
  );
  const teamId = relationshipTeamId;
  const teamName = getTeamName(included, teamId);
  const positionName = removeKnownTeamPrefix(rawPositionName, teamName);
  const personId = getRelationshipId(member.relationships?.person?.data);
  const rawPerson = isNonEmptyString(personId)
    ? peopleById.get(personId)
    : undefined;
  const person = isNonEmptyString(personId)
    ? {
        id: personId,
        name: rawPerson ? getPersonName(rawPerson) : "Unknown person",
        photoThumbnailUrl: rawPerson?.attributes.photo_thumbnail_url ?? null,
        rawPerson,
      }
    : undefined;

  return {
    planPersonId: member.id,
    personId,
    person,
    teamId,
    teamName,
    positionName,
    label: buildRosterLabel(rawPositionName, positionName, teamName),
    status,
    rawStatus,
    assignedTimeIds: getRelationshipIds(member.relationships?.times?.data),
    serviceTimeIds: getRelationshipIds(
      member.relationships?.service_times?.data
    ),
    declineReason: normalizeDeclineReason(member.attributes.decline_reason),
  };
};

export const buildPlanSchedulingContext = ({
  serviceTypeId,
  planId,
  planTeamMembers,
  included,
}: Params & {
  planTeamMembers: (PCResource | RawPlanPerson)[];
  included: PCResource[];
}): PlanSchedulingContext => {
  const peopleById = buildRawPeopleMap(included);
  const rosterEntries = planTeamMembers
    .map((member) => normalizeRosterEntry(member, included, peopleById))
    .filter((entry): entry is PlanRosterEntry => !!entry);
  const rosterByPersonId = new Map<string, PlanRosterEntry[]>();
  const rosterBySlotKey = new Map<string, PlanRosterEntry[]>();

  for (const entry of rosterEntries) {
    if (isNonEmptyString(entry.personId)) {
      const existing = rosterByPersonId.get(entry.personId) ?? [];
      existing.push(entry);
      rosterByPersonId.set(entry.personId, existing);
    }

    if (isNonEmptyString(entry.teamId)) {
      const key = buildSlotKey(entry.teamId, entry.positionName);
      const existing = rosterBySlotKey.get(key) ?? [];
      existing.push(entry);
      rosterBySlotKey.set(key, existing);
    }
  }

  return {
    serviceTypeId,
    planId,
    rosterEntries,
    rosterByPersonId,
    rosterBySlotKey,
    peopleById,
  };
};

export const getPlanSchedulingContext = async (
  { serviceTypeId, planId }: Params,
  peopleService: Pick<PlanningCenterPeopleService, "getPlanTeamMembers">,
  signal?: AbortSignal
): Promise<PlanSchedulingContext> => {
  const response = await peopleService.getPlanTeamMembers(
    serviceTypeId,
    planId,
    signal
  );
  return buildPlanSchedulingContext({
    serviceTypeId,
    planId,
    planTeamMembers: response.data,
    included: response.included ?? [],
  });
};
