"use client";

import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { PlanningCenterServicesIcon } from "@/components/planning-center-services-icon";
import { LineupTab } from "@/components/schedule/lineup-tab";
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
import { usePlanWorkspaceView } from "@/hooks/use-plan-workspace-view";
import type { DashboardView } from "@/lib/schedule-navigation";
import { cn } from "@/lib/utils";

const planDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatPlanDate = (date: Date | string | undefined) => {
  if (date === undefined || date === "") {
    return "No date";
  }
  const dateObj = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dateObj.getTime())) {
    return "Invalid date";
  }

  return planDateFormatter.format(dateObj);
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
  <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
    <h1 className="text-xl font-semibold">Plan unavailable</h1>
    <p className="text-muted-foreground text-sm">
      This plan could not be loaded. Choose a plan from Services.
    </p>
    <Link href="/services" className={buttonVariants()}>
      Go to Services
    </Link>
  </main>
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
      href="/services"
      aria-label="Back to services"
      className={servicesBackClassName}
    >
      <ChevronLeft className="size-6" aria-hidden />
    </Link>
  );

const DashboardPlanHeader = ({
  serviceTypeName,
  planSubtitle,
  sortDate,
  planningCenterUrl,
  onBack,
}: {
  serviceTypeName: string;
  planSubtitle: string | null;
  sortDate: Date | string | undefined;
  planningCenterUrl: string | null | undefined;
  onBack: (() => void) | null;
}) => (
  <>
    <header className="flex shrink-0 items-center gap-1 pt-1.5 pb-2 md:hidden">
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
          {formatPlanDate(sortDate)}
          {isNonEmptyString(planSubtitle) ? ` · ${serviceTypeName}` : null}
        </p>
      </div>
      {isNonEmptyString(planningCenterUrl) ? (
        <PlanningCenterLink href={planningCenterUrl} />
      ) : null}
    </header>
    <header className="mb-3 shrink-0 max-md:hidden sm:mb-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
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
            / {formatPlanDate(sortDate)}
          </span>
        </h1>
        {isNonEmptyString(planningCenterUrl) ? (
          <PlanningCenterLink href={planningCenterUrl} />
        ) : null}
      </div>
    </header>
  </>
);

const DashboardPlanHeaderFallback = () => (
  <>
    <header className="flex shrink-0 items-center gap-1 pt-1.5 pb-2 md:hidden">
      <MobilePlanBack onBack={null} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton variant="text" className="h-4 w-40" />
        <Skeleton variant="text" className="h-3 w-28" />
      </div>
    </header>
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
}: {
  serviceType: DashboardController["selectedServiceType"];
  plan: DashboardController["selectedPlan"];
  onBack: (() => void) | null;
}) => {
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
    />
  );
};

export const DashboardPage = ({
  serviceTypeId,
  planId,
  view: routeView,
}: {
  serviceTypeId: string;
  planId: string;
  view: DashboardView;
}) => {
  const view = usePlanWorkspaceView(serviceTypeId, planId, routeView);
  const {
    workspaceUnavailable,
    hasPlanUrlSelection,
    hasSelectedPlanMetadata,
    selectedServiceType,
    selectedPlan,
    activeView,
    teamPositionsLoading,
    teamPositionGroups,
    collapsedTeams,
    selectedTeam,
    selectedPosition,
    selectedPositionUsesRoster,
    people,
    peopleLoading,
    routeServiceTypeId,
    routePlanId,
    toggleTeamCollapsed,
    handleSlotSelect,
    handleSlotClear,
    handleSlotPreview,
    handleAddCustomPosition,
    planTimes,
  } = useDashboardController({ serviceTypeId, planId, view });
  const planReferenceDate = selectedPlan?.sortDate ?? null;
  if (workspaceUnavailable) {
    return <WorkspaceUnavailable />;
  }

  return (
    <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className={cn(
          "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4",
          hasPlanUrlSelection ? "py-0 md:py-3" : "py-6"
        )}
      >
        <DashboardPlanHeaderSlot
          serviceType={hasSelectedPlanMetadata ? selectedServiceType : null}
          plan={hasSelectedPlanMetadata ? selectedPlan : null}
          onBack={
            activeView === "assign" && isNonEmptyString(selectedPosition)
              ? handleSlotClear
              : null
          }
        />

        {hasPlanUrlSelection ? (
          <Tabs value={activeView} className="flex min-h-0 flex-1 flex-col">
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
                people={selectedPositionUsesRoster ? people : []}
                peopleLoading={
                  selectedPositionUsesRoster ? peopleLoading : false
                }
                selectedServiceTypeId={routeServiceTypeId}
                selectedPlanId={routePlanId}
                planReferenceDate={planReferenceDate}
                onToggleTeam={toggleTeamCollapsed}
                onSelectSlot={handleSlotSelect}
                onClearSlot={handleSlotClear}
                onPreviewSlot={handleSlotPreview}
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
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
            <span>No plan selected · use Services to choose one.</span>
          </div>
        )}
      </div>
    </main>
  );
};
