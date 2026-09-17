"use client";

import Link from "next/link";
import { toast } from "sonner";

import { PlanningCenterServicesIcon } from "@/components/planning-center-services-icon";
import { LineupTab } from "@/components/schedule/lineup-tab";
import { PlanTab } from "@/components/schedule/plan-tab";
import { ScheduleViewTab } from "@/components/schedule/schedule-view-tab";
import { TimesTab } from "@/components/schedule/times-tab";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useDashboardController } from "@/hooks/use-dashboard-controller";
import { isNonEmptyString } from "@/lib/json";
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

const DashboardPlanHeader = ({
  serviceTypeName,
  planSubtitle,
  sortDate,
  planningCenterUrl,
}: {
  serviceTypeName: string;
  planSubtitle: string | null;
  sortDate: Date | string | undefined;
  planningCenterUrl: string | null | undefined;
}) => (
  <header className="mb-3 shrink-0 sm:mb-5">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <h1 className="flex min-w-0 flex-col gap-0.5 text-base leading-tight font-semibold tracking-tight sm:block sm:truncate sm:text-xl md:text-2xl">
        <span className="min-w-0 truncate">
          {serviceTypeName}
          {isNonEmptyString(planSubtitle) ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              / {planSubtitle}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground min-w-0 truncate text-sm font-light tabular-nums sm:text-xl md:text-2xl">
          <span className="hidden sm:inline"> / </span>
          {formatPlanDate(sortDate)}
        </span>
      </h1>
      {isNonEmptyString(planningCenterUrl) ? (
        <HoverCard>
          <HoverCardTrigger
            render={
              <a
                href={planningCenterUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open in Planning Center"
                className={buttonVariants({
                  variant: "outline",
                  size: "icon-sm",
                  className: "shrink-0",
                })}
              />
            }
          >
            <PlanningCenterServicesIcon className="size-4" />
          </HoverCardTrigger>
          <HoverCardContent
            side="bottom"
            align="end"
            sideOffset={8}
            className="w-auto"
          >
            <p className="text-xs font-medium">Open in Planning Center</p>
          </HoverCardContent>
        </HoverCard>
      ) : null}
    </div>
  </header>
);

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
  } = useDashboardController({ serviceTypeId, planId, view });
  const planReferenceDate = selectedPlan?.sortDate ?? null;
  const planSubtitle =
    selectedServiceType && selectedPlan
      ? buildPlanSubtitle(
          selectedServiceType.name,
          selectedPlan.title,
          selectedPlan.seriesTitle
        )
      : null;
  if (workspaceUnavailable) {
    return <WorkspaceUnavailable />;
  }

  return (
    <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className={cn(
          "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 sm:px-4",
          hasPlanUrlSelection ? "py-2 sm:py-3" : "py-6"
        )}
      >
        {hasSelectedPlanMetadata && selectedServiceType && selectedPlan ? (
          <DashboardPlanHeader
            serviceTypeName={selectedServiceType.name}
            planSubtitle={planSubtitle}
            sortDate={selectedPlan.sortDate}
            planningCenterUrl={selectedPlan.planningCenterUrl}
          />
        ) : null}

        {hasPlanUrlSelection ? (
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
                planReferenceDate={planReferenceDate}
                onToggleTeam={toggleTeamCollapsed}
                onSelectSlot={handleSlotSelect}
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
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
            <span>No plan selected · use Services to choose one.</span>
          </div>
        )}
      </div>
    </main>
  );
};
