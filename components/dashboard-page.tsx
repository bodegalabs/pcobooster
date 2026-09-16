"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PlanningCenterServicesIcon } from "@/components/planning-center-services-icon";
import { LineupTab } from "@/components/schedule/lineup-tab";
import { PlanTab } from "@/components/schedule/plan-tab";
import { ScheduleViewTab } from "@/components/schedule/schedule-view-tab";
import { TimesTab } from "@/components/schedule/times-tab";
import type { SlotRef } from "@/components/schedule/types";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { createPeopleQueryOptions, usePeople } from "@/hooks/use-people";
import { createPlanItemsQueryOptions } from "@/hooks/use-plan-items";
import { usePlanTimes } from "@/hooks/use-plan-times";
import { usePlans } from "@/hooks/use-plans";
import { useServiceTypes } from "@/hooks/use-service-types";
import { useTeamPositions } from "@/hooks/use-team-positions";
import type { TeamPosition, TeamPositionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RouteSelectionIds {
  teamId: string | null;
  positionId: string | null;
  view: DashboardView;
}

type NavigationSelectionIds = RouteSelectionIds & {
  serviceTypeId: string | null;
  planId: string | null;
};

export type DashboardView = "assign" | "lineup" | "plan" | "times";
const COLLAPSED_TEAMS_STORAGE_KEY_PREFIX = "schedule-collapsed-teams:";
const COLLAPSED_TEAMS_STORAGE_MAP_KEY = `${COLLAPSED_TEAMS_STORAGE_KEY_PREFIX}by-plan`;
const SLOT_PEOPLE_PREFETCH_DELAY_MS = 180;
type SearchParamReader = Pick<URLSearchParams, "get">;

function buildPlanMemberPositionId(
  teamId: string,
  positionName: string
): string {
  return `plan-member-position:${teamId}:${encodeURIComponent(positionName.trim().toLowerCase())}`;
}

function parseSearchSelection(
  searchParams: SearchParamReader,
  view: DashboardView
): RouteSelectionIds {
  const teamId = searchParams.get("teamId");
  const positionId = searchParams.get("positionId");

  return {
    teamId: teamId ?? null,
    positionId: positionId ?? null,
    view,
  };
}

function buildScheduleUrl({
  serviceTypeId,
  planId,
  teamId,
  positionId,
  view,
}: NavigationSelectionIds): string {
  if (!serviceTypeId || !planId) return "/services";

  const searchParams = new URLSearchParams();
  if (teamId) searchParams.set("teamId", teamId);
  if (positionId) searchParams.set("positionId", positionId);

  const query = searchParams.toString();
  const path = `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/${view}`;
  return query ? `${path}?${query}` : path;
}

function formatPlanDate(date: Date | string | undefined) {
  if (!date) return "No date";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateObj);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPlanSubtitle(
  serviceTypeName: string,
  planTitle: string | undefined,
  seriesTitle: string | undefined
): string | null {
  const rawSubtitle = (seriesTitle ?? planTitle ?? "").trim();
  if (!rawSubtitle) return null;

  const normalizedServiceTypeName = serviceTypeName.trim();
  if (!normalizedServiceTypeName) return rawSubtitle;

  if (
    rawSubtitle.localeCompare(normalizedServiceTypeName, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return null;
  }

  const serviceTypePrefixPattern = new RegExp(
    `^${escapeRegExp(normalizedServiceTypeName)}\\s*[-:|]\\s*`,
    "i"
  );

  const withoutServiceTypePrefix = rawSubtitle
    .replace(serviceTypePrefixPattern, "")
    .trim();
  if (!withoutServiceTypePrefix) return null;

  if (
    withoutServiceTypePrefix.localeCompare(
      normalizedServiceTypeName,
      undefined,
      {
        sensitivity: "accent",
      }
    ) === 0
  ) {
    return null;
  }

  return withoutServiceTypePrefix;
}

export function DashboardPage({
  serviceTypeId,
  planId,
  view,
}: {
  serviceTypeId: string;
  planId: string;
  view: DashboardView;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const slotPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const [collapsedTeamsByPlan, setCollapsedTeamsByPlan] = useState<
    Record<string, Record<string, boolean>>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(COLLAPSED_TEAMS_STORAGE_MAP_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return {};

      const normalized: Record<string, Record<string, boolean>> = {};
      for (const [planId, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object" || Array.isArray(value))
          continue;
        normalized[planId] = Object.fromEntries(
          Object.entries(value).map(([teamId, isCollapsed]) => [
            teamId,
            Boolean(isCollapsed),
          ])
        ) as Record<string, boolean>;
      }
      return normalized;
    } catch {
      return {};
    }
  });

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
      if (nextUrl === currentUrl) return;

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

  const { data: serviceTypes, isLoading: serviceTypesLoading } =
    useServiceTypes();
  const routeServiceTypeId = serviceTypeId;
  const routePlanId = planId;
  const selectedServiceType =
    serviceTypes?.find(
      (serviceType) => serviceType.id === routeServiceTypeId
    ) ?? null;

  const {
    data: plans,
    isLoading: plansLoading,
    isFetching: plansFetching,
  } = usePlans(routeServiceTypeId);
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

  const selectedTeamGroup =
    teamPositionGroups?.find((group) => group.teamId === routeIds.teamId) ??
    null;
  const selectedPositionObj =
    selectedTeamGroup?.positions.find(
      (position) => position.id === routeIds.positionId
    ) ?? null;

  const selectedTeam = routeIds.teamId ?? null;
  const selectedPosition = routeIds.positionId ?? null;
  const validatedTeam = selectedTeamGroup?.teamId ?? null;
  const validatedPosition = selectedPositionObj?.id ?? null;
  const selectedPositionUsesRoster =
    !selectedPositionObj?.source ||
    selectedPositionObj.source === "team_position";
  const canLoadSelectedSlotPeople = Boolean(
    selectedPlan?.sortDate && selectedPosition && selectedPositionUsesRoster
  );
  const selectedPlanId = routePlanId;
  const collapsedTeams = selectedPlanId
    ? (collapsedTeamsByPlan[selectedPlanId] ?? {})
    : {};
  const hasPlanUrlSelection = Boolean(routeServiceTypeId && routePlanId);
  const hasSelectedPlanMetadata = Boolean(selectedServiceType && selectedPlan);
  const activeView: DashboardView = hasPlanUrlSelection
    ? routeIds.view
    : "assign";

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

  const prefetchPlanItems = useCallback(() => {
    if (!routeServiceTypeId || !routePlanId) return;
    void queryClient.prefetchQuery(
      createPlanItemsQueryOptions(routeServiceTypeId, routePlanId)
    );
  }, [queryClient, routePlanId, routeServiceTypeId]);

  useEffect(() => {
    if (!hasPlanUrlSelection || activeView === "plan") return;
    prefetchPlanItems();
  }, [activeView, hasPlanUrlSelection, prefetchPlanItems]);

  const prefetchSlotPeople = useCallback(
    (slot: SlotRef) => {
      if (!routeServiceTypeId || !selectedPlan?.id) return;
      const slotPosition = teamPositionGroups
        ?.find((group) => group.teamId === slot.teamId)
        ?.positions.find((position) => position.id === slot.positionId);
      if (slotPosition?.source && slotPosition.source !== "team_position")
        return;
      void queryClient.prefetchQuery(
        createPeopleQueryOptions(
          routeServiceTypeId,
          slot.teamId,
          slot.positionId,
          selectedPlan.id,
          selectedPlan.sortDate ?? null
        )
      );
    },
    [
      queryClient,
      routeServiceTypeId,
      selectedPlan?.id,
      selectedPlan?.sortDate,
      teamPositionGroups,
    ]
  );

  const handleSlotPreview = useCallback(
    (slot: SlotRef) => {
      if (slotPrefetchTimeoutRef.current) {
        clearTimeout(slotPrefetchTimeoutRef.current);
      }

      slotPrefetchTimeoutRef.current = setTimeout(() => {
        slotPrefetchTimeoutRef.current = null;
        prefetchSlotPeople(slot);
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

  useEffect(() => {
    const hasServiceTypeInUrl = !!routeServiceTypeId;
    const hasPlanInUrl = !!routePlanId;
    const hasTeamOrPositionInUrl = !!routeIds.teamId || !!routeIds.positionId;

    if (hasServiceTypeInUrl && serviceTypesLoading) return;
    if (hasPlanInUrl && (plansLoading || plansFetching)) return;
    if (hasTeamOrPositionInUrl && teamPositionsLoading) return;

    const canonicalUrl = buildScheduleUrl({
      serviceTypeId: selectedServiceType?.id ?? null,
      planId: selectedPlan?.id ?? null,
      teamId: validatedTeam,
      positionId: validatedPosition,
      view: activeView,
    });
    const liveUrl = window.location.search
      ? `${window.location.pathname}${window.location.search}`
      : window.location.pathname;

    if (liveUrl !== canonicalUrl) {
      router.replace(canonicalUrl);
    }
  }, [
    plansFetching,
    plansLoading,
    routeIds.positionId,
    routeIds.teamId,
    router,
    activeView,
    hasPlanUrlSelection,
    routePlanId,
    routeServiceTypeId,
    selectedPlan?.id,
    validatedPosition,
    selectedServiceType?.id,
    validatedTeam,
    serviceTypesLoading,
    teamPositionsLoading,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        COLLAPSED_TEAMS_STORAGE_MAP_KEY,
        JSON.stringify(collapsedTeamsByPlan)
      );
    } catch {
      // Ignore storage write failures (private mode/quota).
    }
  }, [collapsedTeamsByPlan]);

  const handleScheduleSuccess = () => {};

  const handleScheduleError = (message: string) => {
    toast.error(message);
  };

  const handleSlotSelect = (slot: SlotRef) => {
    if (slotPrefetchTimeoutRef.current) {
      clearTimeout(slotPrefetchTimeoutRef.current);
      slotPrefetchTimeoutRef.current = null;
    }
    prefetchSlotPeople(slot);

    if (selectedPlanId) {
      setCollapsedTeamsByPlan((prev) => {
        const currentForPlan = prev[selectedPlanId] ?? {};
        if (currentForPlan[slot.teamId] === false) return prev;

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
    if (!routeServiceTypeId || !routePlanId) return null;
    const trimmedName = positionName.trim();
    if (!trimmedName) return null;

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
      ["team-positions", routeServiceTypeId, routePlanId],
      (groups) => {
        if (!groups) return groups;
        return groups.map((group) => {
          if (group.teamId !== team.teamId) return group;
          const duplicate = group.positions.some(
            (position) =>
              position.name.trim().toLowerCase() === trimmedName.toLowerCase()
          );
          if (duplicate) return group;

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
            positions: [...group.positions, position].sort((a, b) =>
              a.name.localeCompare(b.name)
            ),
          };
        });
      }
    );

    return slot;
  };

  const toggleTeamCollapsed = (teamId: string) => {
    if (!selectedPlanId) return;
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

  const planSubtitle =
    selectedServiceType && selectedPlan
      ? buildPlanSubtitle(
          selectedServiceType.name,
          selectedPlan.title,
          selectedPlan.seriesTitle
        )
      : null;

  return (
    <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className={cn(
          "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 sm:px-4",
          hasPlanUrlSelection ? "py-2 sm:py-3" : "py-6"
        )}
      >
        {hasSelectedPlanMetadata && selectedServiceType && selectedPlan ? (
          <header className="mb-3 shrink-0 sm:mb-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h1 className="flex min-w-0 flex-col gap-0.5 text-base leading-tight font-semibold tracking-tight sm:block sm:truncate sm:text-xl md:text-2xl">
                <span className="min-w-0 truncate">
                  {selectedServiceType.name}
                  {planSubtitle ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      / {planSubtitle}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground min-w-0 truncate text-sm font-light tabular-nums sm:text-xl md:text-2xl">
                  <span className="hidden sm:inline"> / </span>
                  {formatPlanDate(selectedPlan.sortDate)}
                </span>
              </h1>
              {selectedPlan.planningCenterUrl ? (
                <HoverCard openDelay={120} closeDelay={120}>
                  <HoverCardTrigger asChild>
                    <Button
                      asChild
                      variant="outline"
                      size="icon-sm"
                      className="shrink-0"
                    >
                      <a
                        href={selectedPlan.planningCenterUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Planning Center"
                      >
                        <PlanningCenterServicesIcon className="size-4" />
                      </a>
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="bottom"
                    align="end"
                    sideOffset={8}
                    className="w-auto px-3 py-2"
                  >
                    <p className="text-xs font-medium">
                      Open in Planning Center
                    </p>
                  </HoverCardContent>
                </HoverCard>
              ) : null}
            </div>
          </header>
        ) : null}

        {!hasPlanUrlSelection ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
            <span>No plan selected · use Services to choose one.</span>
          </div>
        ) : (
          <Tabs value={activeView} className="flex min-h-0 flex-1 flex-col">
            <TabsContent
              value="assign"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <ScheduleViewTab
                teamPositionsLoading={teamPositionsLoading}
                teamPositionsPlaceholder={teamPositionsPlaceholder}
                teamPositionGroups={teamPositionGroups}
                collapsedTeams={collapsedTeams}
                selectedTeam={selectedTeam}
                selectedPosition={selectedPosition}
                people={selectedPositionUsesRoster ? people : []}
                peopleLoading={
                  selectedPositionUsesRoster ? peopleLoading : false
                }
                peoplePlaceholder={
                  selectedPositionUsesRoster ? peoplePlaceholder : false
                }
                selectedServiceTypeId={routeServiceTypeId}
                selectedPlanId={routePlanId}
                onToggleTeam={toggleTeamCollapsed}
                onSelectSlot={handleSlotSelect}
                onPreviewSlot={handleSlotPreview}
                onAddPosition={handleAddCustomPosition}
                onScheduleSuccess={handleScheduleSuccess}
                onScheduleError={handleScheduleError}
              />
            </TabsContent>

            <TabsContent
              value="lineup"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <LineupTab
                groups={teamPositionGroups ?? []}
                isLoading={teamPositionsLoading}
                isPlaceholderData={teamPositionsPlaceholder}
                serviceTypeId={routeServiceTypeId}
                planId={routePlanId}
                seriesId={selectedPlan?.seriesId ?? null}
                planTimes={planTimes ?? []}
                onSelectPosition={handleSlotSelect}
                onPreviewPosition={handleSlotPreview}
              />
            </TabsContent>

            <TabsContent
              value="plan"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <PlanTab
                serviceTypeId={routeServiceTypeId}
                planId={routePlanId}
              />
            </TabsContent>

            <TabsContent
              value="times"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <TimesTab
                serviceTypeId={routeServiceTypeId}
                planId={routePlanId}
                seriesId={selectedPlan?.seriesId ?? null}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}
