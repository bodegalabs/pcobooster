import { logger } from "@/lib/logger";
import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { planningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import { findAllIncluded, findIncluded } from "@/lib/planning-center/utils";
import type {
  FilledPositionPerson,
  PCResource,
  RawPlan,
  RawNeededPosition,
  RawPlanPerson,
  RawTeam,
  RawTeamPosition,
  TeamPosition,
  TeamPositionGroup,
} from "@/lib/types";
import {
  buildPlanSchedulingContext,
  buildSlotKey,
  isDeclinedRosterStatus,
  type PlanRosterEntry,
} from "@/lib/use-cases/planning-center/plan-scheduling-context";

const log = logger.for("use-case/get-team-positions");

interface NeededPositionsResolution {
  response: { data: PCResource[]; included: PCResource[] };
  resolvedSeriesId: string | null;
  neededPositionSource: "series-plan" | "service-type-plan";
  usedSeriesFallback: boolean;
}

export async function getNeededTeamPositionsForPlan(
  serviceTypeId: string,
  planId: string,
  seriesId?: string | null
): Promise<TeamPositionGroup[]> {
  log.info(
    { serviceTypeId, planId, providedSeriesId: seriesId ?? null },
    "Fetching needed team positions for plan"
  );

  const [
    teamPositionResponse,
    neededPositionsResolution,
    planTeamMembersResponse,
  ] = await Promise.all([
    planningCenterCatalogService.getServiceTypeTeamPositionsWithTeams(
      serviceTypeId
    ),
    resolveNeededPositions(serviceTypeId, planId, seriesId ?? null),
    planningCenterPeopleService.getPlanTeamMembers(serviceTypeId, planId),
  ]);
  const {
    response: neededPositionResponse,
    resolvedSeriesId,
    neededPositionSource,
    usedSeriesFallback,
  } = neededPositionsResolution;

  const teamPositions = Array.isArray(teamPositionResponse.data)
    ? teamPositionResponse.data
    : [teamPositionResponse.data];
  const teamPositionIncluded = teamPositionResponse.included || [];
  const neededPositions = Array.isArray(neededPositionResponse.data)
    ? neededPositionResponse.data
    : [neededPositionResponse.data];
  const neededIncluded = neededPositionResponse.included || [];
  const planTeamMembers = Array.isArray(planTeamMembersResponse.data)
    ? planTeamMembersResponse.data
    : [planTeamMembersResponse.data];
  const planSchedulingContext = buildPlanSchedulingContext({
    serviceTypeId,
    planId,
    planTeamMembers: planTeamMembers as unknown as RawPlanPerson[],
    included: planTeamMembersResponse.included || [],
  });
  const teamMap = new Map<string, TeamPositionGroup>();
  const positionsByTeamAndName = new Map<string, TeamPosition>();

  for (const tp of teamPositions) {
    const position = tp as unknown as RawTeamPosition;
    const { teamId, teamName } = getTeamInfo(position, teamPositionIncluded);
    const positionName = (
      position.attributes.name as string | undefined
    )?.trim();
    if (!teamId || !teamName || !positionName) continue;

    const slot: TeamPosition = {
      id: position.id,
      name: positionName,
      teamId,
      teamName,
      source: "team_position",
      neededCount: 0,
    };

    positionsByTeamAndName.set(
      buildTeamPositionKey(teamId, positionName),
      slot
    );
  }

  for (const np of neededPositions) {
    const needed = np as unknown as RawNeededPosition;
    const quantity = needed.attributes.quantity;
    if (typeof quantity === "number" && quantity <= 0) continue;

    const teamData = needed.relationships?.team?.data;
    const teamId = !Array.isArray(teamData) && teamData ? teamData.id : "";
    const neededName = (needed.attributes.team_position_name || "").trim();
    if (!teamId || !neededName) continue;

    const matchedPosition = positionsByTeamAndName.get(
      buildTeamPositionKey(teamId, neededName)
    );
    let teamName = matchedPosition?.teamName || "";
    if (!teamName) {
      const team = findIncluded(neededIncluded, "Team", teamId) as unknown as
        | RawTeam
        | undefined;
      if (team) teamName = team.attributes.name as string;
    }
    if (!teamName) {
      const team = findIncluded(
        teamPositionIncluded,
        "Team",
        teamId
      ) as unknown as RawTeam | undefined;
      if (team) teamName = team.attributes.name as string;
    }
    if (!teamName) continue;

    if (!teamMap.has(teamId)) {
      teamMap.set(teamId, { teamId, teamName, positions: [] });
    }

    const group = teamMap.get(teamId)!;
    const incrementBy =
      typeof quantity === "number" && quantity > 0 ? quantity : 1;
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
      positionsByTeamAndName.set(
        buildTeamPositionKey(teamId, neededName),
        slot
      );
      continue;
    }

    const existingPosition = group.positions.find(
      (position) => position.id === matchedPosition.id
    );

    if (existingPosition) {
      existingPosition.neededCount =
        (existingPosition.neededCount ?? 0) + incrementBy;
      existingPosition.neededPositionId ??= needed.id;
      existingPosition.timeId ??= timeId;
      existingPosition.timePreferenceOptionId ??= timePreferenceOptionId;
      continue;
    }

    matchedPosition.teamName = teamName;
    matchedPosition.neededPositionId ??= needed.id;
    matchedPosition.timeId ??= timeId;
    matchedPosition.timePreferenceOptionId ??= timePreferenceOptionId;
    matchedPosition.neededCount = incrementBy;
    group.positions.push(matchedPosition);
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

  const groupedPositions: TeamPositionGroup[] = Array.from(teamMap.values());
  groupedPositions.sort((a, b) => a.teamName.localeCompare(b.teamName));
  groupedPositions.forEach((group) => {
    group.positions.sort((a, b) => a.name.localeCompare(b.name));
  });

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
      const needed = np as unknown as RawNeededPosition;
      const teamData = needed.relationships?.team?.data;
      const teamId = !Array.isArray(teamData) && teamData ? teamData.id : null;
      return {
        teamId,
        name: needed.attributes.team_position_name ?? null,
        quantity: needed.attributes.quantity ?? null,
      };
    });
    log.warn(
      { planId, neededSamples },
      "No needed positions matched service type team positions (possible name mismatch)"
    );
  }

  return groupedPositions;
}

function addFilledPositionsToGroups(
  teamMap: Map<string, TeamPositionGroup>,
  positionsByTeamAndName: Map<string, TeamPosition>
) {
  for (const slot of positionsByTeamAndName.values()) {
    const filledCount =
      (slot.filledConfirmedCount ?? 0) + (slot.filledPendingCount ?? 0);
    if (filledCount === 0) continue;
    if (!slot.teamId || !slot.teamName) continue;

    if (!teamMap.has(slot.teamId)) {
      teamMap.set(slot.teamId, {
        teamId: slot.teamId,
        teamName: slot.teamName,
        positions: [],
      });
    }

    const group = teamMap.get(slot.teamId)!;
    const exists = group.positions.some((position) => position.id === slot.id);
    if (!exists) {
      group.positions.push(slot);
    }
  }
}

function addPlanMemberOnlyPositions(
  rosterEntries: PlanRosterEntry[],
  teamMap: Map<string, TeamPositionGroup>,
  positionsByTeamAndName: Map<string, TeamPosition>
) {
  for (const rosterEntry of rosterEntries) {
    if (
      !rosterEntry.teamId ||
      !rosterEntry.teamName ||
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
    if (existingSlot) continue;

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
}

function getTeamInfo(
  position: RawTeamPosition,
  included: PCResource[]
): { teamId: string; teamName: string } {
  let teamId = "";
  let teamName = "";

  if (position.relationships?.team?.data) {
    const teamData = position.relationships.team.data;
    teamId = Array.isArray(teamData)
      ? teamData[0]?.id || ""
      : teamData?.id || "";
  }

  if (teamId) {
    const team = findIncluded(included, "Team", teamId) as unknown as
      | RawTeam
      | undefined;
    if (team) teamName = team.attributes.name as string;
  }

  if (!teamId || !teamName) {
    const teams = findAllIncluded(included, "Team");
    if (teams.length > 0) {
      const team = teams[0] as unknown as RawTeam;
      teamId = team.id;
      teamName = team.attributes.name as string;
    }
  }

  return { teamId, teamName };
}

function buildTeamPositionKey(teamId: string, positionName: string): string {
  return buildSlotKey(teamId, positionName);
}

function buildPlanMemberOnlyPositionId(
  teamId: string,
  positionName: string
): string {
  return `plan-member-position:${teamId}:${encodeURIComponent(positionName.trim().toLowerCase())}`;
}

function buildNeededPositionSlotId(neededPositionId: string): string {
  return `needed-position:${neededPositionId}`;
}

function getRelationshipId(
  data: { id?: string } | { id?: string }[] | null | undefined
): string | null {
  if (!data || Array.isArray(data)) return null;
  return data.id ?? null;
}

function applyPlanTeamMemberSummary(
  rosterEntries: PlanRosterEntry[],
  positionsByTeamAndName: Map<string, TeamPosition>
) {
  for (const rosterEntry of rosterEntries) {
    if (!rosterEntry.teamId || isDeclinedRosterStatus(rosterEntry.status))
      continue;

    const slot = positionsByTeamAndName.get(
      buildTeamPositionKey(rosterEntry.teamId, rosterEntry.positionName)
    );
    if (!slot) continue;

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
      name: rosterEntry.person?.name || "Unknown person",
      status,
      rawStatus: rosterEntry.rawStatus,
      photoThumbnailUrl: rosterEntry.person?.photoThumbnailUrl ?? null,
      assignedTimeIds: rosterEntry.assignedTimeIds,
      serviceTimeIds: rosterEntry.serviceTimeIds,
    };

    if (!slot.filledPeople) {
      slot.filledPeople = [entry];
    } else {
      slot.filledPeople.push(entry);
    }
  }

  for (const slot of positionsByTeamAndName.values()) {
    if (!slot.filledPeople || slot.filledPeople.length === 0) continue;
    slot.filledPeople.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "confirmed" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
}

async function resolveNeededPositions(
  serviceTypeId: string,
  planId: string,
  seriesId: string | null
): Promise<NeededPositionsResolution> {
  if (seriesId) {
    return {
      response:
        await planningCenterCatalogService.getPlanNeededPositionsWithTeams(
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
        await planningCenterCatalogService.getServiceTypePlanNeededPositionsWithTeams(
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

    const resolvedSeriesId = await getSeriesIdForPlan(serviceTypeId, planId);
    if (!resolvedSeriesId) {
      throw error;
    }

    return {
      response:
        await planningCenterCatalogService.getPlanNeededPositionsWithTeams(
          resolvedSeriesId,
          planId
        ),
      resolvedSeriesId,
      neededPositionSource: "series-plan",
      usedSeriesFallback: true,
    };
  }
}

async function getSeriesIdForPlan(
  serviceTypeId: string,
  planId: string
): Promise<string | null> {
  const scopedPlan =
    await planningCenterPlansService.getPlanForServiceTypeWithSeries(
      serviceTypeId,
      planId
    );
  const resolvedSeriesId =
    extractSeriesIdFromPlanResource(scopedPlan.data) ||
    extractSeriesIdFromIncluded(scopedPlan.included);

  if (resolvedSeriesId) {
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
}

function extractSeriesIdFromPlanResource(plan: PCResource): string | null {
  const rawPlan = plan as unknown as RawPlan;
  const seriesData = rawPlan.relationships?.series?.data;
  if (seriesData && !Array.isArray(seriesData)) {
    return seriesData.id || null;
  }

  const relatedLink = getSeriesRelationshipLink(plan);
  if (relatedLink) {
    const match = relatedLink.match(/\/series\/([^/?#]+)/);
    if (match?.[1]) return match[1];
  }

  return null;
}

function extractSeriesIdFromIncluded(included: PCResource[]): string | null {
  const series = included.find((r) => r.type === "Series");
  return series?.id || null;
}

function hasSeriesRelationshipData(plan: PCResource): boolean {
  const rawPlan = plan as unknown as RawPlan;
  const seriesData = rawPlan.relationships?.series?.data;
  return !!seriesData && !Array.isArray(seriesData);
}

function getSeriesRelationshipLink(plan: PCResource): string | null {
  const rel = plan.relationships?.series;
  if (!rel) return null;
  return rel.links?.related || null;
}
