"use client";

import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type {
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import type { SlotRef } from "@/components/schedule/types";
import { useCollapsedTeams } from "@/hooks/use-collapsed-teams";
import { createPeopleQueryOptions, usePeople } from "@/hooks/use-people";
import { createPlanItemsQueryOptions } from "@/hooks/use-plan-items";
import { usePlanTimes } from "@/hooks/use-plan-times";
import { usePlans } from "@/hooks/use-plans";
import { useServiceTypes } from "@/hooks/use-service-types";
import { useTeamPositions } from "@/hooks/use-team-positions";
import { queryKeys } from "@/lib/query-keys";
import type {
  DashboardView,
  NavigationSelectionIds,
} from "@/lib/schedule-navigation";
import {
  buildPlanMemberPositionId,
  buildScheduleUrl,
  parseSearchSelection,
} from "@/lib/schedule-navigation";

const SLOT_PEOPLE_PREFETCH_DELAY_MS = 180;

const resolveSelectedSlot = (
  teamPositionGroups: TeamPositionGroup[] | undefined,
  routeIds: ReturnType<typeof parseSearchSelection>
) => {
  const selectedTeamGroup =
    teamPositionGroups?.find((group) => group.teamId === routeIds.teamId) ??
    null;
  const selectedPositionObj =
    selectedTeamGroup?.positions.find(
      (position) => position.id === routeIds.positionId
    ) ?? null;

  const selectedTeam = selectedTeamGroup?.teamId ?? null;
  const selectedPosition = selectedPositionObj?.id ?? null;
  const selectedPositionUsesRoster =
    selectedPositionObj?.source === undefined ||
    selectedPositionObj.source === "team_position";
  return { selectedTeam, selectedPosition, selectedPositionUsesRoster };
};

const usePlanWorkspaceData = (
  serviceTypeId: string,
  planId: string,
  routeIds: ReturnType<typeof parseSearchSelection>
) => {
  const { data: serviceTypes, isLoading: serviceTypesLoading } =
    useServiceTypes();
  const routeServiceTypeId = serviceTypeId;
  const routePlanId = planId;
  const selectedServiceType =
    serviceTypes?.find(
      (serviceType) => serviceType.id === routeServiceTypeId
    ) ?? null;

  const { data: plans, isLoading: plansLoading } = usePlans(routeServiceTypeId);
  const selectedPlan = plans?.find((plan) => plan.id === routePlanId) ?? null;

  const {
    data: teamPositionGroups,
    isLoading: teamPositionsLoading,
    isPlaceholderData: teamPositionsPlaceholder,
  } = useTeamPositions(
    routeServiceTypeId,
    routePlanId,
    selectedPlan?.seriesId ?? null
  );
  const { data: planTimes } = usePlanTimes(routeServiceTypeId, routePlanId);

  const { selectedTeam, selectedPosition, selectedPositionUsesRoster } =
    resolveSelectedSlot(teamPositionGroups, routeIds);
  const canLoadSelectedSlotPeople =
    selectedPlan?.sortDate !== undefined &&
    isNonEmptyString(selectedPosition) &&
    selectedPositionUsesRoster;
  const {
    data: people,
    isLoading: peopleLoading,
    isPlaceholderData: peoplePlaceholder,
  } = usePeople(
    routeServiceTypeId,
    canLoadSelectedSlotPeople ? selectedTeam : null,
    canLoadSelectedSlotPeople ? selectedPosition : null,
    routePlanId,
    selectedPlan?.sortDate ?? null
  );

  const workspaceUnavailable =
    !serviceTypesLoading &&
    !plansLoading &&
    (!selectedServiceType || !selectedPlan);
  return {
    selectedServiceType,
    selectedPlan,
    teamPositionGroups,
    teamPositionsLoading,
    teamPositionsPlaceholder,
    planTimes,
    selectedTeam,
    selectedPosition,
    selectedPositionUsesRoster,
    people,
    peopleLoading,
    peoplePlaceholder,
    workspaceUnavailable,
  };
};

export const useDashboardController = ({
  serviceTypeId,
  planId,
  view,
}: {
  serviceTypeId: string;
  planId: string;
  view: DashboardView;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const slotPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const [collapsedTeamsByPlan, setCollapsedTeamsByPlan] = useCollapsedTeams();

  const routeIds = useMemo(
    () => parseSearchSelection(searchParams, view),
    [searchParams, view]
  );
  const currentUrl = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const navigateTo = useCallback(
    (nextIds: NavigationSelectionIds, method: "push" | "replace" = "push") => {
      const nextUrl = buildScheduleUrl(nextIds);
      if (nextUrl === currentUrl) {
        return;
      }

      startTransition(() => {
        if (method === "replace") {
          router.replace(nextUrl);
          return;
        }
        router.push(nextUrl);
      });
    },
    [currentUrl, router]
  );

  const {
    selectedServiceType,
    selectedPlan,
    teamPositionGroups,
    teamPositionsLoading,
    teamPositionsPlaceholder,
    planTimes,
    selectedTeam,
    selectedPosition,
    selectedPositionUsesRoster,
    people,
    peopleLoading,
    peoplePlaceholder,
    workspaceUnavailable,
  } = usePlanWorkspaceData(serviceTypeId, planId, routeIds);
  const routeServiceTypeId = serviceTypeId;
  const routePlanId = planId;
  const selectedPlanId = planId;
  const collapsedTeams = collapsedTeamsByPlan[planId] ?? {};
  const hasPlanUrlSelection = true;
  const hasSelectedPlanMetadata = Boolean(selectedServiceType && selectedPlan);
  const activeView = view;

  useEffect(() => {
    if (
      !teamPositionGroups ||
      teamPositionsLoading ||
      teamPositionsPlaceholder
    ) {
      return;
    }
    if (
      routeIds.teamId === selectedTeam &&
      routeIds.positionId === selectedPosition
    ) {
      return;
    }
    navigateTo(
      {
        serviceTypeId,
        planId,
        view,
        teamId: selectedTeam,
        positionId: selectedPosition,
      },
      "replace"
    );
  }, [
    navigateTo,
    planId,
    routeIds,
    selectedPosition,
    selectedTeam,
    serviceTypeId,
    teamPositionGroups,
    teamPositionsLoading,
    teamPositionsPlaceholder,
    view,
  ]);

  const prefetchPlanItems = useCallback(async () => {
    if (!routeServiceTypeId || !routePlanId) {
      return;
    }
    try {
      await queryClient.query(
        createPlanItemsQueryOptions(routeServiceTypeId, routePlanId)
      );
    } catch {
      // Opening the Plan tab owns any visible loading error.
    }
  }, [queryClient, routePlanId, routeServiceTypeId]);

  useEffect(() => {
    if (!hasPlanUrlSelection || activeView === "plan") {
      return;
    }
    void prefetchPlanItems();
  }, [activeView, hasPlanUrlSelection, prefetchPlanItems]);

  const prefetchSlotPeople = useCallback(
    async (slot: SlotRef) => {
      if (!routeServiceTypeId || !selectedPlan) {
        return;
      }
      const slotPosition = teamPositionGroups
        ?.find((group) => group.teamId === slot.teamId)
        ?.positions.find((position) => position.id === slot.positionId);
      if (slotPosition?.source && slotPosition.source !== "team_position") {
        return;
      }
      try {
        await queryClient.query(
          createPeopleQueryOptions(
            routeServiceTypeId,
            slot.teamId,
            slot.positionId,
            selectedPlan.id,
            selectedPlan.sortDate ?? null
          )
        );
      } catch {
        // The selected-slot query owns any visible loading error.
      }
    },
    [queryClient, routeServiceTypeId, selectedPlan, teamPositionGroups]
  );

  const handleSlotPreview = useCallback(
    (slot: SlotRef) => {
      if (slotPrefetchTimeoutRef.current) {
        clearTimeout(slotPrefetchTimeoutRef.current);
      }

      slotPrefetchTimeoutRef.current = setTimeout(() => {
        slotPrefetchTimeoutRef.current = null;
        void prefetchSlotPeople(slot);
      }, SLOT_PEOPLE_PREFETCH_DELAY_MS);
    },
    [prefetchSlotPeople]
  );

  useEffect(
    () => () => {
      if (slotPrefetchTimeoutRef.current) {
        clearTimeout(slotPrefetchTimeoutRef.current);
      }
    },
    []
  );

  const handleSlotSelect = (slot: SlotRef) => {
    if (slotPrefetchTimeoutRef.current) {
      clearTimeout(slotPrefetchTimeoutRef.current);
      slotPrefetchTimeoutRef.current = null;
    }
    void prefetchSlotPeople(slot);

    if (selectedPlanId) {
      setCollapsedTeamsByPlan((prev) => {
        const currentForPlan = prev[selectedPlanId] ?? {};
        if (!currentForPlan[slot.teamId]) {
          return prev;
        }

        return {
          ...prev,
          [selectedPlanId]: {
            ...currentForPlan,
            [slot.teamId]: false,
          },
        };
      });
    }

    navigateTo({
      serviceTypeId: routeServiceTypeId,
      planId: routePlanId,
      teamId: slot.teamId,
      positionId: slot.positionId,
      view: "assign",
    });
  };

  const handleAddCustomPosition = (
    team: { teamId: string; teamName: string },
    positionName: string
  ): SlotRef | null => {
    if (!routeServiceTypeId || !routePlanId) {
      return null;
    }
    const trimmedName = positionName.trim();
    if (!trimmedName) {
      return null;
    }

    const existingPosition = teamPositionGroups
      ?.find((group) => group.teamId === team.teamId)
      ?.positions.find(
        (position) =>
          position.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
    if (existingPosition) {
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        positionId: existingPosition.id,
        positionName: existingPosition.name,
        source: existingPosition.source,
      };
    }

    const positionId = buildPlanMemberPositionId(team.teamId, trimmedName);
    const slot: SlotRef = {
      teamId: team.teamId,
      teamName: team.teamName,
      positionId,
      positionName: trimmedName,
      source: "custom",
    };

    queryClient.setQueryData<TeamPositionGroup[]>(
      queryKeys.teamPositions(routeServiceTypeId, routePlanId, null),
      (groups) => {
        if (!groups) {
          return groups;
        }
        return groups.map((group) => {
          if (group.teamId !== team.teamId) {
            return group;
          }
          const duplicate = group.positions.some(
            (position) =>
              position.name.trim().toLowerCase() === trimmedName.toLowerCase()
          );
          if (duplicate) {
            return group;
          }

          const position: TeamPosition = {
            id: positionId,
            name: trimmedName,
            teamId: team.teamId,
            teamName: team.teamName,
            source: "custom",
            neededCount: 0,
          };

          return {
            ...group,
            positions: [...group.positions, position].toSorted((a, b) =>
              a.name.localeCompare(b.name)
            ),
          };
        });
      }
    );

    return slot;
  };

  const toggleTeamCollapsed = (teamId: string) => {
    if (!selectedPlanId) {
      return;
    }
    setCollapsedTeamsByPlan((prev) => {
      const currentForPlan = prev[selectedPlanId] ?? {};
      return {
        ...prev,
        [selectedPlanId]: {
          ...currentForPlan,
          [teamId]: !currentForPlan[teamId],
        },
      };
    });
  };

  return {
    workspaceUnavailable,
    hasPlanUrlSelection,
    hasSelectedPlanMetadata,
    selectedServiceType,
    selectedPlan,
    activeView,
    teamPositionsLoading,
    teamPositionsPlaceholder,
    teamPositionGroups,
    collapsedTeams,
    selectedTeam,
    selectedPosition,
    selectedPositionUsesRoster,
    people,
    peopleLoading,
    peoplePlaceholder,
    routeServiceTypeId,
    routePlanId,
    toggleTeamCollapsed,
    handleSlotSelect,
    handleSlotPreview,
    handleAddCustomPosition,
    planTimes,
  };
};
