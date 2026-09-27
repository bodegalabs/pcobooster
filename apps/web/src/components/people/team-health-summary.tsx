import { Activity } from "lucide-react";

import { Meter, Metric } from "@/components/people/shared-components";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PeopleDashboardProgress } from "@/lib/people-dashboard";
import type { TeamHealth, TeamHealthStatus } from "@/lib/team-health";
import { cn } from "@/lib/utils";

const statusLabel: Record<TeamHealthStatus, string> = {
  steady: "Steady",
  stretched: "Stretched",
  thin: "Thin",
};

const statusTone: Record<TeamHealthStatus, string> = {
  steady: "bg-status-confirmed/12 text-status-confirmed",
  stretched: "bg-status-scheduled/15 text-status-scheduled",
  thin: "bg-status-declined/12 text-status-declined",
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

const share = (count: number, total: number) =>
  total === 0 ? 0 : count / total;

/** How much of the team's serving the busiest few carried, as one bar. */
const ServingSpread = ({
  topCount,
  topShare,
  stretched,
}: {
  topCount: number;
  topShare: number;
  stretched: boolean;
}) => (
  <div className="mt-3 flex flex-col gap-1.5">
    <div className="text-muted-foreground flex items-baseline justify-between gap-3 text-xs tabular-nums">
      <span>
        <span className="text-foreground font-medium">
          Busiest {topCount} · {percent(topShare)}
        </span>{" "}
        of serving days
      </span>
      <span>Everyone else · {percent(1 - topShare)}</span>
    </div>
    <Meter
      value={topShare}
      tone={stretched ? "attention" : "neutral"}
      className="h-2"
    />
  </div>
);

const people = (count: number) => (count === 1 ? "person" : "people");

const describeHealth = (health: TeamHealth): string => {
  const served = `${health.activeCount} of ${health.memberCount} ${people(health.memberCount)} served in the last 90 days`;
  if (health.status === "thin") {
    return `Only ${served}. Consider who could step back in.`;
  }
  if (health.status === "stretched" && health.topShare !== null) {
    return `${served}, but the busiest ${health.topCount} ${people(health.topCount)} covered ${percent(health.topShare)} of serving days.`;
  }
  if (health.status === "steady") {
    return `${served}, and serving is spread across the team.`;
  }
  return `${served}.`;
};

interface TeamHealthSummaryProps {
  health: TeamHealth;
  scopeLabel: string;
  progress: PeopleDashboardProgress | undefined;
  isLoading: boolean;
}

/** Overall team health: a plain-language verdict and the numbers behind it. */
export const TeamHealthSummary = ({
  health,
  scopeLabel,
  progress,
  isLoading,
}: TeamHealthSummaryProps) => {
  const partial =
    progress !== undefined &&
    progress.hydratedPeopleCount < progress.scopePeopleCount;
  const declineShare =
    health.requests === 0 ? null : health.declined / health.requests;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <span className="flex items-start gap-2">
            <Activity className="text-muted-foreground mt-1 size-4 shrink-0" />
            <span className="min-w-0">
              {scopeLabel}
              {health.status !== null && !isLoading ? (
                <span
                  className={cn(
                    "ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-xs font-medium",
                    statusTone[health.status]
                  )}
                >
                  {statusLabel[health.status]}
                </span>
              ) : null}
            </span>
          </span>
        </CardTitle>
        <CardDescription>
          {isLoading ? (
            <Skeleton variant="text" className="mt-0.5 h-3.5 w-72 max-w-full" />
          ) : (
            <>
              {describeHealth(health)}
              {partial
                ? ` Based on ${progress.hydratedPeopleCount} of ${progress.scopePeopleCount} people so far.`
                : null}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="control" className="h-14" />
            ))
          ) : (
            <>
              <Metric
                label="Served in 90 days"
                value={`${health.activeCount} of ${health.memberCount}`}
                meter={share(health.activeCount, health.memberCount)}
                tone={health.status === "thin" ? "negative" : "positive"}
              />
              <Metric
                label="Scheduled next 30 days"
                value={`${health.scheduledAheadCount} of ${health.memberCount}`}
                meter={share(health.scheduledAheadCount, health.memberCount)}
              />
              {declineShare === null ? (
                <Metric label="Declined in 6 months" value="-" />
              ) : (
                <Metric
                  label="Declined in 6 months"
                  value={percent(declineShare)}
                  meter={declineShare}
                  tone="negative"
                />
              )}
              <Metric
                label="Unanswered requests"
                value={String(health.pendingCount)}
              />
            </>
          )}
        </div>
        {health.topShare !== null && !isLoading ? (
          <ServingSpread
            topCount={health.topCount}
            topShare={health.topShare}
            stretched={health.status === "stretched"}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};
