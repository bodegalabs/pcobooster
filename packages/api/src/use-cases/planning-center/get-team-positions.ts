import { isNonEmptyString, isNumber, isString } from "@worship-admin/api/json";
import { logger } from "@worship-admin/api/logger";
import { planningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import type { PlanningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { planningCenterPlansService } from "@worship-admin/api/planning-center/services/plans-service";
import type { PlanningCenterPlansService } from "@worship-admin/api/planning-center/services/plans-service";
import {
  findAllIncluded,
  findIncluded,
} from "@worship-admin/api/planning-center/utils";
import type {
  FilledPositionPerson,
  PCResource,
  TeamPosition,
  TeamPositionGroup,
} from "@worship-admin/api/types";
import {
  buildPlanSchedulingContext,
  buildSlotKey,
  isDeclinedRosterStatus,
} from "@worship-admin/api/use-cases/planning-center/plan-scheduling-context";
import type { PlanRosterEntry } from "@worship-admin/api/use-cases/planning-center/plan-scheduling-context";

const log = logger.for("use-case/get-team-positions");

interface NeededPositionsResolution {
  response: { data: PCResource[]; included: PCResource[] };
  resolvedSeriesId: string | null;
  neededPositionSource: "series-plan" | "service-type-plan";
  usedSeriesFallback: boolean;
}

export interface TeamPositionDependencies {
  catalogService: Pick<
    PlanningCenterCatalogService,
    | "getServiceTypeTeamPositionsWithTeams"
    | "getPlanNeededPositionsWithTeams"
    | "getServiceTypePlanNeededPositionsWithTeams"
  >;
  peopleService: Pick<PlanningCenterPeopleService, "getPlanTeamMembers">;
  plansService: Pick<
    PlanningCenterPlansService,
    "getPlanForServiceTypeWithSeries"
  >;
}

const defaultDependencies: TeamPositionDependencies = {
  catalogService: planningCenterCatalogService,
  peopleService: planningCenterPeopleService,
  plansService: planningCenterPlansService,
};

const addFilledPositionsToGroups = (
  teamMap: Map<string, TeamPositionGroup>,
  positionsByTeamAndName: Map<string, TeamPosition>
) => {
  for (const slot of positionsByTeamAndName.values()) {
    const filledCount =
      (slot.filledConfirmedCount ?? 0) + (slot.filledPendingCount ?? 0);
    if (filledCount === 0) {
      continue;
    }
    if (!slot.teamId || !isNonEmptyString(slot.teamName)) {
      continue;
    }

    if (!teamMap.has(slot.teamId)) {
      teamMap.set(slot.teamId, {
        teamId: slot.teamId,
        teamName: slot.teamName,
        positions: [],
      });
    }

    const group = teamMap.get(slot.teamId);
    if (!group) {
      continue;
    }
    const exists = group.positions.some((position) => position.id === slot.id);
    if (!exists) {
      group.positions.push(slot);
    }
  }
};

interface TeamInfo {
  teamId: string;
  teamName: string;
}

const getTeamInfo = (
  position: PCResource,
  included: PCResource[]
): TeamInfo => {
  let teamId = "";
  let teamName = "";

  if (position.relationships?.team?.data) {
    const teamData = position.relationships.team.data;
    teamId = Array.isArray(teamData)
      ? (teamData[0]?.id ?? "")
      : teamData?.id || "";
  }

  if (teamId) {
    const team = findIncluded(included, "Team", teamId);
    if (team) {
      teamName = isString(team.attributes.name) ? team.attributes.name : "";
    }
  }

  if (!teamId || !teamName) {
    const teams = findAllIncluded(included, "Team");
    if (teams.length > 0) {
      const [team] = teams;
      teamId = team.id;
      teamName = isString(team.attributes.name) ? team.attributes.name : "";
    }
  }

  return { teamId, teamName };
};

const buildTeamPositionKey = (teamId: string, positionName: string): string =>
  buildSlotKey(teamId, positionName);

const buildPlanMemberOnlyPositionId = (
  teamId: string,
  positionName: string
): string =>
  `plan-member-position:${teamId}:${encodeURIComponent(positionName.trim().toLowerCase())}`;

const buildNeededPositionSlotId = (neededPositionId: string): string =>
  `needed-position:${neededPositionId}`;

const getRelationshipId = (
  data: { id?: string } | { id?: string }[] | null | undefined
): string | null => {
  if (!data || Array.isArray(data)) {
    return null;
  }
  return data.id ?? null;
};

const applyPlanTeamMemberSummary = (
  rosterEntries: PlanRosterEntry[],
  positionsByTeamAndName: Map<string, TeamPosition>
) => {
  for (const rosterEntry of rosterEntries) {
    if (
      !isNonEmptyString(rosterEntry.teamId) ||
      isDeclinedRosterStatus(rosterEntry.status)
    ) {
      continue;
    }

    const slot = positionsByTeamAndName.get(
      buildTeamPositionKey(rosterEntry.teamId, rosterEntry.positionName)
    );
    if (!slot) {
      continue;
    }

    const status = rosterEntry.status === "confirmed" ? "confirmed" : "pending";

    if (status === "confirmed") {
      slot.filledConfirmedCount = (slot.filledConfirmedCount ?? 0) + 1;
    } else {
      slot.filledPendingCount = (slot.filledPendingCount ?? 0) + 1;
    }

    const entry: FilledPositionPerson = {
      id: rosterEntry.personId ?? `unknown-${rosterEntry.planPersonId}`,
      planPersonId: rosterEntry.planPersonId,
      personId: rosterEntry.personId,
      name: rosterEntry.person?.name ?? "Unknown person",
      status,
      rawStatus: rosterEntry.rawStatus,
      photoThumbnailUrl: rosterEntry.person?.photoThumbnailUrl ?? null,
      assignedTimeIds: rosterEntry.assignedTimeIds,
      serviceTimeIds: rosterEntry.serviceTimeIds,
    };

    if (slot.filledPeople) {
      slot.filledPeople.push(entry);
    } else {
      slot.filledPeople = [entry];
    }
  }

  for (const slot of positionsByTeamAndName.values()) {
    if (!slot.filledPeople || slot.filledPeople.length === 0) {
      continue;
    }
    slot.filledPeople.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "confirmed" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
};

const addPlanMemberOnlyPositions = (
  rosterEntries: PlanRosterEntry[],
  teamMap: Map<string, TeamPositionGroup>,
  positionsByTeamAndName: Map<string, TeamPosition>
) => {
  for (const rosterEntry of rosterEntries) {
    if (
      !isNonEmptyString(rosterEntry.teamId) ||
      !isNonEmptyString(rosterEntry.teamName) ||
      isDeclinedRosterStatus(rosterEntry.status)
    ) {
      continue;
    }

    const key = buildTeamPositionKey(
      rosterEntry.teamId,
      rosterEntry.positionName
    );
    const existingSlot = positionsByTeamAndName.get(key);
    if (existingSlot?.source === "plan_member") {
      applyPlanTeamMemberSummary([rosterEntry], positionsByTeamAndName);
      continue;
    }
    if (existingSlot) {
      continue;
    }

    const slot: TeamPosition = {
      id: buildPlanMemberOnlyPositionId(
        rosterEntry.teamId,
        rosterEntry.positionName
      ),
      name: rosterEntry.positionName,
      teamId: rosterEntry.teamId,
      teamName: rosterEntry.teamName,
      source: "plan_member",
      neededCount: 0,
    };

    positionsByTeamAndName.set(key, slot);
    applyPlanTeamMemberSummary([rosterEntry], positionsByTeamAndName);

    if (!teamMap.has(rosterEntry.teamId)) {
      teamMap.set(rosterEntry.teamId, {
        teamId: rosterEntry.teamId,
        teamName: rosterEntry.teamName,
        positions: [],
      });
    }
  }
};

const extractSeriesIdFromIncluded = (included: PCResource[]): string | null => {
  const series = included.find((r) => r.type === "Series");
  return series?.id ?? null;
};

const hasSeriesRelationshipData = (plan: PCResource): boolean => {
  const seriesData = plan.relationships?.series?.data;
  return !!seriesData && !Array.isArray(seriesData);
};

const getSeriesRelationshipLink = (plan: PCResource): string | null => {
  const rel = plan.relationships?.series;
  if (!rel) {
    return null;
  }
  return rel.links?.related ?? null;
};

const extractSeriesIdFromPlanResource = (plan: PCResource): string | null => {
  const seriesData = plan.relationships?.series?.data;
  if (seriesData && !Array.isArray(seriesData)) {
    return seriesData.id || null;
  }

  const relatedLink = getSeriesRelationshipLink(plan);
  if (isNonEmptyString(relatedLink)) {
    const match = /\/series\/(?<seriesId>[^/?#]+)/u.exec(relatedLink);
    if (isNonEmptyString(match?.groups?.seriesId)) {
      return match.groups.seriesId;
    }
  }

  return null;
};

const getSeriesIdForPlan = async (
  serviceTypeId: string,
  planId: string,
  dependencies: TeamPositionDependencies
): Promise<string | null> => {
  const scopedPlan =
    await dependencies.plansService.getPlanForServiceTypeWithSeries(
      serviceTypeId,
      planId
    );
  const resolvedSeriesId =
    extractSeriesIdFromPlanResource(scopedPlan.data) ??
    extractSeriesIdFromIncluded(scopedPlan.included);

  if (isNonEmptyString(resolvedSeriesId)) {
    log.info(
      { planId, serviceTypeId, resolvedSeriesId },
      "Resolved series ID for fallback"
    );
  } else {
    log.warn(
      {
        planId,
        serviceTypeId,
        hasSeriesRelationshipData: hasSeriesRelationshipData(scopedPlan.data),
        seriesRelationshipLink: getSeriesRelationshipLink(scopedPlan.data),
        includedTypes: scopedPlan.included.map((r) => r.type),
      },
      "Unable to resolve series ID for needed positions fallback"
    );
  }

  return resolvedSeriesId;
};

const resolveNeededPositions = async (
  serviceTypeId: string,
  planId: string,
  seriesId: string | null,
  dependencies: TeamPositionDependencies
): Promise<NeededPositionsResolution> => {
  if (isNonEmptyString(seriesId)) {
    return {
      response:
        await dependencies.catalogService.getPlanNeededPositionsWithTeams(
          seriesId,
          planId
        ),
      resolvedSeriesId: seriesId,
      neededPositionSource: "series-plan",
      usedSeriesFallback: false,
    };
  }

  try {
    return {
      response:
        await dependencies.catalogService.getServiceTypePlanNeededPositionsWithTeams(
          serviceTypeId,
          planId
        ),
      resolvedSeriesId: null,
      neededPositionSource: "service-type-plan",
      usedSeriesFallback: false,
    };
  } catch (error) {
    log.warn(
      {
        serviceTypeId,
        planId,
        error:
          error instanceof Error
            ? error.message.slice(0, 280)
            : String(error).slice(0, 280),
      },
      "Service-type needed positions fetch failed, trying series lookup fallback"
    );

    const resolvedSeriesId = await getSeriesIdForPlan(
      serviceTypeId,
      planId,
      dependencies
    );
    if (!isNonEmptyString(resolvedSeriesId)) {
      throw error;
    }

    return {
      response:
        await dependencies.catalogService.getPlanNeededPositionsWithTeams(
          resolvedSeriesId,
          planId
        ),
      resolvedSeriesId,
      neededPositionSource: "series-plan",
      usedSeriesFallback: true,
    };
  }
};

const indexTeamPositions = (
  teamPositions: PCResource[],
  included: PCResource[]
): Map<string, TeamPosition> => {
  const positionsByTeamAndName = new Map<string, TeamPosition>();
  for (const position of teamPositions) {
    const { teamId, teamName } = getTeamInfo(position, included);
    const positionName = isString(position.attributes.name)
      ? position.attributes.name.trim()
      : "";
    if (!teamId || !teamName || !isNonEmptyString(positionName)) {
      continue;
    }
    positionsByTeamAndName.set(buildTeamPositionKey(teamId, positionName), {
      id: position.id,
      name: positionName,
      teamId,
      teamName,
      source: "team_position",
      neededCount: 0,
    });
  }
  return positionsByTeamAndName;
};

const resolveNeededTeamName = (
  teamId: string,
  matchedPosition: TeamPosition | undefined,
  neededIncluded: PCResource[],
  teamPositionIncluded: PCResource[]
): string => {
  if (isNonEmptyString(matchedPosition?.teamName)) {
    return matchedPosition.teamName;
  }
  for (const included of [neededIncluded, teamPositionIncluded]) {
    const team = findIncluded(included, "Team", teamId);
    if (team && isNonEmptyString(team.attributes.name)) {
      return team.attributes.name;
    }
  }
  return "";
};

interface NeededPositionMaps {
  teamMap: Map<string, TeamPositionGroup>;
  positionsByTeamAndName: Map<string, TeamPosition>;
  neededIncluded: PCResource[];
  teamPositionIncluded: PCResource[];
}

const mergeMatchedNeededPosition = (
  group: TeamPositionGroup,
  matchedPosition: TeamPosition,
  needed: PCResource,
  teamName: string,
  incrementBy: number,
  timeId: string | null,
  timePreferenceOptionId: string | null
): void => {
  const existingPosition = group.positions.find(
    (position) => position.id === matchedPosition.id
  );
  if (existingPosition) {
    existingPosition.neededCount =
      (existingPosition.neededCount ?? 0) + incrementBy;
    existingPosition.neededPositionId ??= needed.id;
    existingPosition.timeId ??= timeId;
    existingPosition.timePreferenceOptionId ??= timePreferenceOptionId;
    return;
  }
  matchedPosition.teamName = teamName;
  matchedPosition.neededPositionId ??= needed.id;
  matchedPosition.timeId ??= timeId;
  matchedPosition.timePreferenceOptionId ??= timePreferenceOptionId;
  matchedPosition.neededCount = incrementBy;
  group.positions.push(matchedPosition);
};

const applyNeededPosition = (
  needed: PCResource,
  maps: NeededPositionMaps
): void => {
  const { quantity } = needed.attributes;
  if (isNumber(quantity) && quantity <= 0) {
    return;
  }
  const teamData = needed.relationships?.team?.data;
  const teamId = !Array.isArray(teamData) && teamData ? teamData.id : "";
  const neededName = isString(needed.attributes.team_position_name)
    ? needed.attributes.team_position_name.trim()
    : "";
  if (!teamId || !neededName) {
    return;
  }
  const positionKey = buildTeamPositionKey(teamId, neededName);
  const matchedPosition = maps.positionsByTeamAndName.get(positionKey);
  const teamName = resolveNeededTeamName(
    teamId,
    matchedPosition,
    maps.neededIncluded,
    maps.teamPositionIncluded
  );
  if (!teamName) {
    return;
  }
  if (!maps.teamMap.has(teamId)) {
    maps.teamMap.set(teamId, { teamId, teamName, positions: [] });
  }
  const group = maps.teamMap.get(teamId);
  if (!group) {
    return;
  }
  const incrementBy = isNumber(quantity) && quantity > 0 ? quantity : 1;
  const timeId = getRelationshipId(needed.relationships?.time?.data);
  const timePreferenceOptionId = getRelationshipId(
    needed.relationships?.time_preference_option?.data
  );

  if (!matchedPosition) {
    const slot: TeamPosition = {
      id: buildNeededPositionSlotId(needed.id),
      name: neededName,
      teamId,
      teamName,
      source: "needed_position",
      neededPositionId: needed.id,
      timeId,
      timePreferenceOptionId,
      neededCount: incrementBy,
    };
    group.positions.push(slot);
    maps.positionsByTeamAndName.set(positionKey, slot);
    return;
  }

  mergeMatchedNeededPosition(
    group,
    matchedPosition,
    needed,
    teamName,
    incrementBy,
    timeId,
    timePreferenceOptionId
  );
};

export const getNeededTeamPositionsForPlan = async (
  serviceTypeId: string,
  planId: string,
  seriesId?: string | null,
  dependencies: TeamPositionDependencies = defaultDependencies
): Promise<TeamPositionGroup[]> => {
  log.info(
    { serviceTypeId, planId, providedSeriesId: seriesId ?? null },
    "Fetching needed team positions for plan"
  );

  const [
    teamPositionResponse,
    neededPositionsResolution,
    planTeamMembersResponse,
  ] = await Promise.all([
    dependencies.catalogService.getServiceTypeTeamPositionsWithTeams(
      serviceTypeId
    ),
    resolveNeededPositions(
      serviceTypeId,
      planId,
      seriesId ?? null,
      dependencies
    ),
    dependencies.peopleService.getPlanTeamMembers(serviceTypeId, planId),
  ]);
  const {
    response: neededPositionResponse,
    resolvedSeriesId,
    neededPositionSource,
    usedSeriesFallback,
  } = neededPositionsResolution;

  const teamPositions = teamPositionResponse.data;
  const teamPositionIncluded = teamPositionResponse.included ?? [];
  const neededPositions = neededPositionResponse.data;
  const neededIncluded = neededPositionResponse.included ?? [];
  const planTeamMembers = planTeamMembersResponse.data;
  const planSchedulingContext = buildPlanSchedulingContext({
    serviceTypeId,
    planId,
    planTeamMembers,
    included: planTeamMembersResponse.included ?? [],
  });
  const teamMap = new Map<string, TeamPositionGroup>();
  const positionsByTeamAndName = indexTeamPositions(
    teamPositions,
    teamPositionIncluded
  );
  const positionMaps = {
    teamMap,
    positionsByTeamAndName,
    neededIncluded,
    teamPositionIncluded,
  };
  for (const needed of neededPositions) {
    applyNeededPosition(needed, positionMaps);
  }

  applyPlanTeamMemberSummary(
    planSchedulingContext.rosterEntries,
    positionsByTeamAndName
  );
  addPlanMemberOnlyPositions(
    planSchedulingContext.rosterEntries,
    teamMap,
    positionsByTeamAndName
  );
  addFilledPositionsToGroups(teamMap, positionsByTeamAndName);

  const groupedPositions: TeamPositionGroup[] = [...teamMap.values()];
  groupedPositions.sort((a, b) => a.teamName.localeCompare(b.teamName));
  for (const group of groupedPositions) {
    group.positions.sort((a, b) => a.name.localeCompare(b.name));
  }

  log.info(
    {
      serviceTypeId,
      planId,
      seriesId: resolvedSeriesId ?? null,
      neededPositionSource,
      usedSeriesFallback,
      serviceTypeTeamPositionCount: teamPositions.length,
      neededPositionCount: neededPositions.length,
      planTeamMemberCount: planTeamMembers.length,
      matchedTeamCount: groupedPositions.length,
      matchedPositionCount: groupedPositions.reduce(
        (sum, g) => sum + g.positions.length,
        0
      ),
    },
    "Resolved plan needed positions"
  );

  if (groupedPositions.length === 0 && neededPositions.length > 0) {
    const neededSamples = neededPositions.slice(0, 10).map((np) => {
      const needed = np;
      const teamData = needed.relationships?.team?.data;
      const teamId = !Array.isArray(teamData) && teamData ? teamData.id : null;
      return {
        teamId,
        name: isString(needed.attributes.team_position_name)
          ? needed.attributes.team_position_name
          : null,
        quantity: isNumber(needed.attributes.quantity)
          ? needed.attributes.quantity
          : null,
      };
    });
    log.warn(
      { planId, neededSamples },
      "No needed positions matched service type team positions (possible name mismatch)"
    );
  }

  return groupedPositions;
};
