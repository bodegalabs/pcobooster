import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { Plan } from "@pcobooster/planning-center-models/types";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PlanAccessNotice } from "@/components/access/access-notices";
import { MobileHeader } from "@/components/mobile-menu";
import { PageShell } from "@/components/page-shell";
import { PlanningCenterServicesIcon } from "@/components/planning-center-services-icon";
import { LineupTab } from "@/components/schedule/lineup-tab";
import { PlanOverviewTab } from "@/components/schedule/plan-overview-tab";
import { PlanTab } from "@/components/schedule/plan-tab";
import { PlanHeaderSkeleton } from "@/components/schedule/schedule-skeletons";
import { ScheduleViewTab } from "@/components/schedule/schedule-view-tab";
import { TimesTab } from "@/components/schedule/times-tab";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { HoverLabel } from "@/components/ui/hover-card";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useDashboardController } from "@/hooks/use-dashboard-controller";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { createAdjacentPlanQueryOptions } from "@/hooks/use-plans";
import type { PlanNeighbor } from "@/hooks/use-plans";
import { NEXT_PLAN_HOTKEY, PREVIOUS_PLAN_HOTKEY } from "@/lib/app-hotkeys";
import { queryKeys } from "@/lib/query-keys";
import type { DashboardView } from "@/lib/schedule-navigation";
import { formatPlanDate } from "@/lib/service-plan-selection";

const formatHeaderPlanDate = (
  date: Date | string | undefined,
  orgTimeZone: string
) => {
  if (date === undefined || date === "") {
    return "No date";
  }
  const dateObj = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dateObj.getTime())) {
    return "Invalid date";
  }

  return formatPlanDate(dateObj, orgTimeZone);
};

const escapeRegExp = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const buildPlanSubtitle = (
  serviceTypeName: string,
  planTitle: string | undefined,
  seriesTitle: string | undefined
): string | null => {
  const rawSubtitle = (seriesTitle ?? planTitle ?? "").trim();
  if (!rawSubtitle) {
    return null;
  }

  const normalizedServiceTypeName = serviceTypeName.trim();
  if (!normalizedServiceTypeName) {
    return rawSubtitle;
  }

  if (
    rawSubtitle.localeCompare(normalizedServiceTypeName, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return null;
  }

  const serviceTypePrefixPattern = new RegExp(
    `^${escapeRegExp(normalizedServiceTypeName)}\\s*[-:|]\\s*`,
    "iu"
  );

  const withoutServiceTypePrefix = rawSubtitle
    .replace(serviceTypePrefixPattern, "")
    .trim();
  if (!withoutServiceTypePrefix) {
    return null;
  }

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
};

const handleScheduleError = (message: string) => {
  toast.error(message);
};

const WorkspaceUnavailable = () => (
  <PageShell layout="center">
    <h1 className="text-xl font-semibold">Plan unavailable</h1>
    <p className="text-muted-foreground text-sm">
      This plan could not be loaded. Choose a plan from Services.
    </p>
    <Link to="/services" className={buttonVariants()}>
      Go to Services
    </Link>
  </PageShell>
);

const PlanningCenterLink = ({ href }: { href: string }) => (
  <HoverLabel
    label="Open in Planning Center"
    side="bottom"
    align="end"
    sideOffset={8}
    render={
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label="Open in Planning Center"
        className={buttonVariants({
          variant: "outline",
          size: "icon-sm",
          className: "shrink-0 max-md:size-9 max-md:rounded-full",
        })}
      />
    }
  >
    <PlanningCenterServicesIcon className="size-4" />
  </HoverLabel>
);

const servicesBackClassName = buttonVariants({
  variant: "ghost",
  size: "icon-lg",
  className: "-ml-2",
});

/** Phones go up one level: from a position to the position list, then to Services. */
const MobilePlanBack = ({ onBack }: { onBack: (() => void) | null }) =>
  onBack ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label="Back to positions"
      className="-ml-2"
      onClick={onBack}
    >
      <ChevronLeft className="size-6" aria-hidden />
    </Button>
  ) : (
    <Link
      to="/services"
      aria-label="Back to services"
      className={servicesBackClassName}
    >
      <ChevronLeft className="size-6" aria-hidden />
    </Link>
  );

type PlanDirection = "previous" | "next";

interface PlanNeighbors {
  serviceTypeId: string;
  planId: string;
  view: DashboardView;
  previousPlan: PlanNeighbor;
  nextPlan: PlanNeighbor;
}

const PLAN_STEP_LABELS = {
  previous: "Previous plan",
  next: "Next plan",
} as const;

/**
 * Steps to the plan before or after this one on the same view. Listed neighbors are
 * links; past the loaded list, one lookup finds the neighbor when someone asks for it.
 */
const usePlanStepper = ({
  serviceTypeId,
  planId,
  view,
  previousPlan,
  nextPlan,
}: PlanNeighbors) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [ends, setEnds] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<PlanDirection | null>(null);
  const endKey = (direction: PlanDirection) => `${planId}:${direction}`;

  const openPlan = (plan: Plan) => {
    void navigate({
      to: "/services/$serviceTypeId/plans/$planId/$view",
      params: { serviceTypeId, planId: plan.id, view },
    });
  };

  const step = async (direction: PlanDirection) => {
    const neighbor = direction === "previous" ? previousPlan : nextPlan;
    if (neighbor.kind === "known") {
      openPlan(neighbor.plan);
      return;
    }
    if (ends.has(endKey(direction)) || pending !== null) {
      return;
    }
    setPending(direction);
    let plan: Plan | null;
    try {
      plan = await queryClient.query(
        createAdjacentPlanQueryOptions(serviceTypeId, planId, direction)
      );
    } catch {
      setPending(null);
      toast.error("Couldn't load that plan.");
      return;
    }
    setPending(null);
    if (plan === null) {
      setEnds((current) => new Set(current).add(endKey(direction)));
      toast(`No ${direction === "previous" ? "earlier" : "later"} plan`);
      return;
    }
    // The lookup already has the plan's header details, so its page needn't fetch them.
    queryClient.setQueryData(
      queryKeys.planDetails(serviceTypeId, plan.id),
      plan
    );
    openPlan(plan);
  };

  const onRequest = (direction: PlanDirection) => () => {
    void step(direction);
  };
  useHotkey(PREVIOUS_PLAN_HOTKEY, onRequest("previous"), {
    ignoreInputs: true,
  });
  useHotkey(NEXT_PLAN_HOTKEY, onRequest("next"), { ignoreInputs: true });

  return {
    isEnd: (direction: PlanDirection) => ends.has(endKey(direction)),
    pending,
    onRequest,
  };
};

type PlanStepper = ReturnType<typeof usePlanStepper>;

const PlanStepButton = ({
  direction,
  neighbor,
  neighbors,
  stepper,
}: {
  direction: PlanDirection;
  neighbor: PlanNeighbor;
  neighbors: PlanNeighbors;
  stepper: PlanStepper;
}) => {
  const orgTimeZone = useOrganizationTimeZone();
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const label = PLAN_STEP_LABELS[direction];
  if (neighbor.kind === "known") {
    const planDate = formatHeaderPlanDate(neighbor.plan.sortDate, orgTimeZone);
    return (
      <HoverLabel
        label={`${label}: ${planDate}`}
        side="bottom"
        sideOffset={8}
        render={
          <Link
            to="/services/$serviceTypeId/plans/$planId/$view"
            params={{
              serviceTypeId: neighbors.serviceTypeId,
              planId: neighbor.plan.id,
              view: neighbors.view,
            }}
            aria-label={`${label}, ${planDate}`}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          />
        }
      >
        <Icon className="size-4" />
      </HoverLabel>
    );
  }
  const isEnd = stepper.isEnd(direction);
  return (
    <HoverLabel
      label={isEnd ? `No ${label.toLowerCase()}` : label}
      side="bottom"
      sideOffset={8}
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isEnd || stepper.pending !== null}
          aria-busy={stepper.pending === direction}
          aria-label={isEnd ? `No ${label.toLowerCase()}` : label}
          onClick={stepper.onRequest(direction)}
        />
      }
    >
      {stepper.pending === direction ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Icon className="size-4" />
      )}
    </HoverLabel>
  );
};

const DashboardPlanHeader = ({
  serviceTypeName,
  planSubtitle,
  sortDate,
  planningCenterUrl,
  onBack,
  neighbors,
  stepper,
}: {
  serviceTypeName: string;
  planSubtitle: string | null;
  sortDate: Date | string | undefined;
  planningCenterUrl: string | null | undefined;
  onBack: (() => void) | null;
  neighbors: PlanNeighbors;
  stepper: PlanStepper;
}) => {
  const orgTimeZone = useOrganizationTimeZone();
  const planDate = formatHeaderPlanDate(sortDate, orgTimeZone);
  return (
    <>
      <MobileHeader className="-mx-4">
        <MobilePlanBack onBack={onBack} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="min-w-0 text-base leading-tight font-semibold tracking-tight">
            <MiddleTruncate
              text={
                isNonEmptyString(planSubtitle) ? planSubtitle : serviceTypeName
              }
            />
          </h1>
          <p className="text-muted-foreground truncate text-xs tabular-nums">
            {planDate}
            {isNonEmptyString(planSubtitle) ? ` · ${serviceTypeName}` : null}
          </p>
        </div>
        {isNonEmptyString(planningCenterUrl) ? (
          <PlanningCenterLink href={planningCenterUrl} />
        ) : null}
      </MobileHeader>
      <header className="mb-3 shrink-0 max-md:hidden sm:mb-5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-xl leading-tight font-semibold tracking-tight md:text-2xl">
              {serviceTypeName}
              {isNonEmptyString(planSubtitle) ? (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  / {planSubtitle}
                </span>
              ) : null}
              <span className="text-muted-foreground font-light tabular-nums">
                {" "}
                / {planDate}
              </span>
            </h1>
            <div className="flex shrink-0 items-center">
              <PlanStepButton
                direction="previous"
                neighbor={neighbors.previousPlan}
                neighbors={neighbors}
                stepper={stepper}
              />
              <PlanStepButton
                direction="next"
                neighbor={neighbors.nextPlan}
                neighbors={neighbors}
                stepper={stepper}
              />
            </div>
          </div>
          {isNonEmptyString(planningCenterUrl) ? (
            <PlanningCenterLink href={planningCenterUrl} />
          ) : null}
        </div>
      </header>
    </>
  );
};

const DashboardPlanHeaderFallback = () => (
  <>
    <MobileHeader className="-mx-4">
      <MobilePlanBack onBack={null} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton variant="text" className="h-4 w-40" />
        <Skeleton variant="text" className="h-3 w-28" />
      </div>
    </MobileHeader>
    <div className="max-md:hidden">
      <PlanHeaderSkeleton />
    </div>
  </>
);

type DashboardController = ReturnType<typeof useDashboardController>;

const DashboardPlanHeaderSlot = ({
  serviceType,
  plan,
  onBack,
  neighbors,
}: {
  serviceType: DashboardController["selectedServiceType"];
  plan: DashboardController["selectedPlan"];
  onBack: (() => void) | null;
  neighbors: PlanNeighbors;
}) => {
  const stepper = usePlanStepper(neighbors);
  if (!serviceType || !plan) {
    return <DashboardPlanHeaderFallback />;
  }
  return (
    <DashboardPlanHeader
      serviceTypeName={serviceType.name}
      planSubtitle={buildPlanSubtitle(
        serviceType.name,
        plan.title,
        plan.seriesTitle
      )}
      sortDate={plan.sortDate}
      planningCenterUrl={plan.planningCenterUrl}
      onBack={onBack}
      neighbors={neighbors}
      stepper={stepper}
    />
  );
};

export const DashboardPage = ({
  serviceTypeId,
  planId,
  view,
}: {
  serviceTypeId: string;
  planId: string;
  view: DashboardView;
}) => {
  const {
    workspaceUnavailable,
    hasPlanUrlSelection,
    hasSelectedPlanMetadata,
    selectedServiceType,
    selectedPlan,
    previousPlan,
    nextPlan,
    activeView,
    teamPositionsLoading,
    teamPositionGroups,
    collapsedTeams,
    selectedTeam,
    selectedPosition,
    selectedPositionUsesRoster,
    candidateList,
    routeServiceTypeId,
    routePlanId,
    toggleTeamCollapsed,
    handleSlotSelect,
    handleSlotClear,
    getSlotIntentProps,
    handleAddCustomPosition,
    planTimes,
  } = useDashboardController({ serviceTypeId, planId, view });
  const planReferenceDate = selectedPlan?.sortDate ?? null;
  if (workspaceUnavailable) {
    return <WorkspaceUnavailable />;
  }

  return (
    <PageShell layout="fill">
      <DashboardPlanHeaderSlot
        serviceType={hasSelectedPlanMetadata ? selectedServiceType : null}
        plan={hasSelectedPlanMetadata ? selectedPlan : null}
        onBack={
          activeView === "assign" && isNonEmptyString(selectedPosition)
            ? handleSlotClear
            : null
        }
        neighbors={{
          serviceTypeId: routeServiceTypeId,
          planId: routePlanId,
          view: activeView,
          previousPlan,
          nextPlan,
        }}
      />

      {hasPlanUrlSelection ? (
        <PlanAccessNotice
          serviceTypeId={routeServiceTypeId}
          view={activeView}
        />
      ) : null}

      {hasPlanUrlSelection ? (
        <Tabs value={activeView} className="flex min-h-0 flex-1 flex-col">
          <TabsContent
            value="overview"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <PlanOverviewTab
              serviceTypeId={routeServiceTypeId}
              planId={routePlanId}
              selectedPlan={selectedPlan}
              teamPositionGroups={teamPositionGroups}
              teamPositionsLoading={teamPositionsLoading}
              planTimes={planTimes}
              getSlotIntentProps={getSlotIntentProps}
            />
          </TabsContent>

          <TabsContent
            value="assign"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <ScheduleViewTab
              teamPositionsLoading={teamPositionsLoading}
              teamPositionGroups={teamPositionGroups}
              collapsedTeams={collapsedTeams}
              selectedTeam={selectedTeam}
              selectedPosition={selectedPosition}
              candidateList={selectedPositionUsesRoster ? candidateList : null}
              selectedServiceTypeId={routeServiceTypeId}
              selectedPlanId={routePlanId}
              planReferenceDate={planReferenceDate}
              onToggleTeam={toggleTeamCollapsed}
              onSelectSlot={handleSlotSelect}
              onClearSlot={handleSlotClear}
              getSlotIntentProps={getSlotIntentProps}
              onAddPosition={handleAddCustomPosition}
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
              serviceTypeId={routeServiceTypeId}
              planId={routePlanId}
              seriesId={selectedPlan?.seriesId ?? null}
              planTimes={planTimes ?? []}
              onSelectPosition={handleSlotSelect}
              getSlotIntentProps={getSlotIntentProps}
            />
          </TabsContent>

          <TabsContent
            value="plan"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <PlanTab
              serviceTypeId={routeServiceTypeId}
              planId={routePlanId}
              planDate={planReferenceDate}
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
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
          <span>No plan selected · use Services to choose one.</span>
        </div>
      )}
    </PageShell>
  );
};
