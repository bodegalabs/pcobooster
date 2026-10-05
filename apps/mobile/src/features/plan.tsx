import {
  buildReadinessChecks,
  formatDuration,
  formatTimeOfDay,
  summarizeOrder,
  summarizeStaffing,
  summarizeTimes,
} from "@pcobooster/client/plan-overview";
import type {
  OpenPosition,
  PlanStaffing,
} from "@pcobooster/client/plan-overview";
import { queryKeys } from "@pcobooster/client/query-keys";
import type { UnnotifiedPerson } from "@pcobooster/client/scheduling-notifications";
import { collectUnnotifiedPeople } from "@pcobooster/client/scheduling-notifications";
import type { Plan } from "@pcobooster/contracts/catalog";
import { serviceTypeAbilities } from "@pcobooster/planning-center-models/access";
import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";

import {
  Action,
  Card,
  Choice,
  Label,
  ReadState,
  Row,
  Screen,
} from "../components/ui";
import { runAction } from "../errors";
import { useAccount, useRpcQuery } from "../runtime";
import { tabRouter as router } from "../tab-router";
import { Lineup } from "./lineup";
import { RunSheet } from "./run-sheet";
import { Times } from "./times";

export interface PlanContext {
  serviceTypeId: string;
  planId: string;
  canEdit: boolean;
  canSchedule: boolean;
  timeZone: string;
  planDate?: Date;
}

const views = {
  overview: "Overview",
  assign: "Lineup",
  lineup: "Lineup",
  plan: "Plan",
  times: "Times",
};
const Notifications = ({
  people,
  url,
  onOpen,
}: {
  people: readonly UnnotifiedPerson[];
  url: string | null | undefined;
  onOpen: () => void;
}) => {
  if (people.length === 0) {
    return null;
  }
  return (
    <Card title={`${people.length} people not notified`}>
      <Label>{people.map((person) => person.name).join(", ")}</Label>
      <Label secondary>
        They cannot see or answer until the scheduling email is sent in Planning
        Center.
      </Label>
      {url !== null && url !== undefined && url !== "" ? (
        <Action
          label="Send in Planning Center"
          onPress={() => {
            onOpen();
            void runAction(async () => {
              await Linking.openURL(url);
            });
          }}
        />
      ) : null}
    </Card>
  );
};
const OverviewPeople = ({
  query,
  staffing,
  unnotified,
  planningCenterUrl,
  onOpenPlanningCenter,
  assign,
  onSegment,
}: {
  query: { isPending: boolean; error: Error | null; refetch: () => void };
  staffing: PlanStaffing | null;
  unnotified: readonly UnnotifiedPerson[];
  planningCenterUrl: string | null | undefined;
  onOpenPlanningCenter: () => void;
  assign: (position?: OpenPosition) => void;
  onSegment: (segment: string) => void;
}): ReactNode => {
  const [showAllOpen, setShowAllOpen] = useState(false);
  return (
    <Card title="People">
      <ReadState query={query}>
        <Label>
          {staffing?.confirmed ?? 0} confirmed, {staffing?.pending ?? 0}{" "}
          pending, {staffing?.open ?? 0} open
        </Label>
        <Notifications
          people={unnotified}
          url={planningCenterUrl}
          onOpen={onOpenPlanningCenter}
        />
        {(staffing?.openPositions.length ?? 0) > 0 ? (
          <Label heading>Needs someone</Label>
        ) : null}
        {(showAllOpen
          ? staffing?.openPositions
          : staffing?.openPositions.slice(0, 5)
        )?.map((position) => (
          <Row
            key={`${position.teamId}-${position.positionId}`}
            title={position.positionName}
            detail={`${position.teamName}, ${position.openCount} open`}
            onPress={() => {
              assign(position);
            }}
          />
        ))}
        {(staffing?.openPositions.length ?? 0) > 5 ? (
          <Action
            label={
              showAllOpen ? "Show fewer positions" : "Show all open positions"
            }
            onPress={() => {
              setShowAllOpen(!showAllOpen);
            }}
          />
        ) : null}
        {staffing?.teams.map((team) => (
          <Row
            key={team.teamId}
            title={team.teamName}
            detail={`${team.confirmed} confirmed, ${team.pending} pending, ${team.open} open`}
            onPress={() => {
              onSegment("Lineup");
            }}
          />
        ))}
      </ReadState>
    </Card>
  );
};

const Overview = ({
  context,
  onSegment,
  planningCenterUrl,
}: {
  context: PlanContext;
  onSegment: (segment: string) => void;
  planningCenterUrl: string | null | undefined;
}) => {
  const groups = useRpcQuery(
    "catalog.teamPositions",
    context,
    queryKeys.teamPositions(context.serviceTypeId, context.planId, null)
  );
  const items = useRpcQuery(
    "planItems.list",
    context,
    queryKeys.planItems(context.serviceTypeId, context.planId)
  );
  const times = useRpcQuery(
    "planTimes.list",
    context,
    queryKeys.planTimes(context.serviceTypeId, context.planId)
  );
  const staffing = groups.data ? summarizeStaffing(groups.data) : null;
  const order = items.data ? summarizeOrder(items.data) : null;
  const schedule = times.data ? summarizeTimes(times.data) : null;
  const checks = buildReadinessChecks({ staffing, order, schedule });
  const unnotified = collectUnnotifiedPeople(groups.data ?? []);
  const recheck = useRef(false);
  const refetchRoster = groups.refetch;
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && recheck.current) {
        recheck.current = false;
        void refetchRoster();
      }
    });
    return () => {
      listener.remove();
    };
  }, [refetchRoster]);
  const assign = (position?: OpenPosition): void => {
    if (!context.canSchedule) {
      onSegment("Lineup");
      return;
    }
    router.push({
      pathname: "/services/[serviceTypeId]/plans/[planId]/assign",
      params: {
        serviceTypeId: context.serviceTypeId,
        planId: context.planId,
        teamId: position?.teamId ?? "",
        positionId: position?.positionId ?? "",
      },
    });
  };
  return (
    <>
      <Card title="Readiness">
        {groups.isPending || items.isPending || times.isPending ? (
          <Label secondary>Checking the plan…</Label>
        ) : null}
        {groups.isError || items.isError || times.isError ? (
          <Label secondary>
            Some checks are incomplete. Retry the affected section below.
          </Label>
        ) : null}
        {checks.map((check) => (
          <Row
            key={check.id}
            title={`${check.state === "done" ? "✓" : "○"} ${check.label}`}
            onPress={() => {
              if (check.view === "assign") {
                assign(staffing?.openPositions[0]);
              } else {
                onSegment(views[check.view]);
              }
            }}
          />
        ))}
      </Card>
      <OverviewPeople
        query={groups}
        staffing={staffing}
        unnotified={unnotified}
        planningCenterUrl={planningCenterUrl}
        onOpenPlanningCenter={() => {
          recheck.current = true;
        }}
        assign={assign}
        onSegment={onSegment}
      />
      <Card title="Songs and run sheet">
        <ReadState query={items}>
          <Label secondary>
            {order?.itemCount ?? 0} items,{" "}
            {formatDuration(order?.serviceLength ?? 0) ?? "No duration"}
          </Label>
          {order?.songs.map((song) => (
            <Row
              key={song.id}
              title={song.title}
              detail={song.keyLabel ?? "No key"}
              onPress={() => {
                onSegment("Plan");
              }}
            />
          ))}
          <Action
            label="Edit run sheet"
            onPress={() => {
              onSegment("Plan");
            }}
          />
        </ReadState>
      </Card>
      <Card title="Times">
        <ReadState query={times}>
          {schedule?.times.map((time) => (
            <Row
              key={time.id}
              title={time.name || time.timeType}
              detail={`${formatCalendarDateLabel(time.startsAt, context.timeZone, "weekdayMonthDay")} ${formatTimeOfDay(time.startsAt, context.timeZone)}`}
              onPress={() => {
                onSegment("Times");
              }}
            />
          ))}
        </ReadState>
      </Card>
    </>
  );
};

const PlanningCenterLink = ({ url }: { url: string | null | undefined }) => {
  if (url === null || url === undefined) {
    return null;
  }
  return (
    <Action
      label="Open in Planning Center"
      onPress={() => {
        void runAction(async () => {
          await Linking.openURL(url);
        });
      }}
    />
  );
};

const planDate = (plan: Plan | null | undefined): Date | undefined =>
  plan?.sortDate;

export const PlanScreen = () => {
  const params = useLocalSearchParams<{
    serviceTypeId: string;
    planId: string;
    segment?: string;
  }>();
  const [segment, setSegment] = useState(params.segment ?? "Overview");
  const account = useAccount();
  const plan = useRpcQuery(
    "catalog.plan",
    { serviceTypeId: params.serviceTypeId, planId: params.planId },
    queryKeys.planDetails(params.serviceTypeId, params.planId)
  );
  const abilities = account.access.data
    ? serviceTypeAbilities(account.access.data, params.serviceTypeId)
    : null;
  const context = {
    serviceTypeId: params.serviceTypeId,
    planId: params.planId,
    canEdit: !account.readOnly && (abilities?.editPlans ?? false),
    canSchedule: !account.readOnly && (abilities?.scheduleLedTeams ?? false),
    timeZone: account.timeZone,
    planDate: planDate(plan.data),
  };
  const previous = useRpcQuery(
    "catalog.adjacentPlans",
    { ...params, direction: "previous" },
    queryKeys.adjacentPlans(params.serviceTypeId, params.planId, "previous")
  );
  const next = useRpcQuery(
    "catalog.adjacentPlans",
    { ...params, direction: "next" },
    queryKeys.adjacentPlans(params.serviceTypeId, params.planId, "next")
  );
  return (
    <Screen
      title={plan.data?.title ?? "Plan"}
      refresh={() => {
        void plan.refetch();
      }}
      fetching={plan.isRefetching}
    >
      <ReadState query={plan}>
        {plan.data === null ? (
          <Label>This plan no longer exists.</Label>
        ) : (
          <>
            <Label secondary>
              {plan.data?.sortDate
                ? formatCalendarDateLabel(
                    plan.data.sortDate,
                    account.timeZone,
                    "weekdayMonthDay"
                  )
                : ""}
            </Label>
            <Choice
              values={["Overview", "Lineup", "Plan", "Times"]}
              value={segment}
              onChange={setSegment}
            />
            <Choice
              values={["Previous", "Next"]}
              value=""
              onChange={(direction) => {
                const target =
                  direction === "Previous"
                    ? previous.data?.[0]
                    : next.data?.[0];
                if (target) {
                  router.replace({
                    pathname: "/services/[serviceTypeId]/plans/[planId]",
                    params: {
                      serviceTypeId: params.serviceTypeId,
                      planId: target.id,
                      segment,
                    },
                  });
                }
              }}
            />
            {segment === "Overview" ? (
              <Overview
                context={context}
                onSegment={setSegment}
                planningCenterUrl={plan.data?.planningCenterUrl}
              />
            ) : null}
            {segment === "Lineup" ? <Lineup context={context} /> : null}
            {segment === "Plan" ? <RunSheet context={context} /> : null}
            {segment === "Times" ? <Times context={context} /> : null}
            <PlanningCenterLink url={plan.data?.planningCenterUrl} />
          </>
        )}
      </ReadState>
    </Screen>
  );
};
