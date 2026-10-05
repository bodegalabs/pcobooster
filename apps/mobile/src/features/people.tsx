import {
  PEOPLE_DASHBOARD_SAMPLE_SIZE,
  buildMonthDays,
  serviceDays,
  chunkPersonIds,
  defaultPeopleDashboardScope,
  initialScopeLoadCount,
  matchesPeopleQuery,
  normalizePeopleQuery,
  parsePeopleDashboardScope,
  resolveScopePersonIds,
  teamScope,
  toDashboardPerson,
} from "@pcobooster/client/people-dashboard";
import type { PeopleDashboardScope } from "@pcobooster/client/people-dashboard";
import { queryKeys } from "@pcobooster/client/query-keys";
import { callForQuery } from "@pcobooster/client/request-priority";
import type { TeamHealth } from "@pcobooster/client/team-health";
import {
  computeTeamHealth,
  describePersonSignal,
} from "@pcobooster/client/team-health";
import type {
  PeopleDashboardPersonDetail,
  PeopleDashboardPerson,
  PeopleDashboardRosterPerson,
  PeopleDashboardTeam,
} from "@pcobooster/contracts/people-schemas";
import {
  formatCalendarDayInTimeZone,
  formatCalendarDateLabel,
} from "@pcobooster/planning-center-models/calendar";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking } from "react-native";

import {
  Action,
  Card,
  Choice,
  Field,
  Label,
  ReadState,
  Row,
  Screen,
} from "../components/ui";
import { loadDashboardActivity } from "../dashboard-activity";
import { openPlanLink } from "../routing";
import {
  useAccount,
  useRpcQuery,
  useSession,
  useScreenFocus,
} from "../runtime";
import { tabRouter as router } from "../tab-router";

const scopeKey = ["native", "people-scope"];
const describeScope = (
  scope: PeopleDashboardScope,
  teams: readonly PeopleDashboardTeam[]
): string => {
  if (scope === "all") {
    return "All teams";
  }
  if (scope === "mine") {
    return "Teams you lead";
  }
  return (
    teams.find((team) => teamScope(team.id) === scope)?.name ?? "All teams"
  );
};
const visiblePeople = ({
  scopePeople,
  members,
  term,
  sampleSet,
  health,
  category,
  view,
  selectedDay,
}: {
  scopePeople: readonly PeopleDashboardRosterPerson[];
  members: readonly PeopleDashboardPerson[];
  term: string;
  sampleSet: ReadonlySet<string>;
  health: TeamHealth;
  category: string;
  view: string;
  selectedDay: string;
}) =>
  scopePeople.filter((person) => {
    const member = members.find(({ id }) => id === person.id) ?? null;
    if (
      view === "Month" &&
      selectedDay !== "All days" &&
      member?.monthDays.some((day) => day.day === Number(selectedDay)) !== true
    ) {
      return false;
    }
    if (term !== "") {
      return matchesPeopleQuery({ person, member }, term);
    }
    if (!sampleSet.has(person.id)) {
      return false;
    }
    const signals = health.signalsById.get(person.id) ?? [];
    if (category === "Check in") {
      return signals.some((signal) =>
        ["declining", "drifting", "overloaded"].includes(signal.kind)
      );
    }
    if (category === "Waiting on reply") {
      return signals.some((signal) => signal.kind === "waiting");
    }
    if (category === "Due for a slot") {
      return signals.some((signal) => signal.kind === "due");
    }
    return true;
  });
const DashboardPersonCard = ({
  person,
  facts,
  view,
  selectedDay,
  monthLabel,
  health,
}: {
  person: PeopleDashboardRosterPerson;
  facts: PeopleDashboardPerson | undefined;
  view: string;
  selectedDay: string;
  monthLabel: string;
  health: TeamHealth;
}) => (
  <Card>
    <Row
      title={person.name}
      detail={person.teams.join(", ")}
      onPress={() => {
        router.push(`/people/${person.id}`);
      }}
    />
    {view === "Health" && facts ? (
      <>
        <Label>
          {facts.rhythm.servedDays30} serving days in 30 days,{" "}
          {facts.rhythm.upcomingDays30} upcoming
        </Label>
        {(health.signalsById.get(person.id) ?? []).map((signal) => {
          const text = describePersonSignal(signal);
          return (
            <Label key={signal.kind} secondary>
              {text.label}: {text.detail}
            </Label>
          );
        })}
      </>
    ) : null}
    {view === "Month"
      ? facts?.monthDays.flatMap((day) =>
          selectedDay !== "All days" && day.day !== Number(selectedDay)
            ? []
            : [
                <Row
                  key={`${day.day}-${day.positionName}-${day.serviceTypeName}-${day.kind}-${day.status}-${day.planUrl}`}
                  title={`${monthLabel} ${day.day}, ${day.kind}`}
                  detail={[day.positionName, day.serviceTypeName, day.status]
                    .filter(Boolean)
                    .join(", ")}
                  onPress={
                    day.planUrl === undefined
                      ? undefined
                      : () => {
                          openPlanLink(day.planUrl);
                        }
                  }
                />,
              ]
        )
      : null}
  </Card>
);

const usePeopleDashboard = () => {
  const account = useAccount();
  const { rpc } = useSession();
  const client = useQueryClient();
  const roster = useRpcQuery(
    "people.dashboardRoster",
    {},
    queryKeys.peopleDashboardRoster(),
    account.features.data?.people === true
  );
  const preferences = useQuery({
    queryKey: scopeKey,
    initialData: "default",
    enabled: false,
    queryFn: () => "default",
  });
  const scope =
    parsePeopleDashboardScope(preferences.data) ??
    (roster.data ? defaultPeopleDashboardScope(roster.data) : "all");
  const [choosingTeam, setChoosingTeam] = useState(false);
  const [view, setView] = useState("Health");
  const [category, setCategory] = useState("Everyone");
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  const [extra, setExtra] = useState(0);
  const [searchLimit, setSearchLimit] = useState(16);
  const [selectedDay, setSelectedDay] = useState("All days");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettledSearch(normalizePeopleQuery(search));
      setSearchLimit(16);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);
  const scopeIds = roster.data ? resolveScopePersonIds(roster.data, scope) : [];
  const scoped = new Set(scopeIds);
  const scopePeople =
    roster.data?.people.filter((person) => scoped.has(person.id)) ?? [];
  const sampleCount = Math.min(
    scopeIds.length,
    initialScopeLoadCount(scope, scopeIds.length) + extra
  );
  const sampleIds = scopeIds.slice(0, sampleCount);
  const sampleSet = new Set(sampleIds);
  const matching = scopePeople.filter((person) =>
    matchesPeopleQuery({ person, member: null }, settledSearch)
  );
  const extraMatches =
    settledSearch === ""
      ? []
      : matching.filter((person) => !sampleSet.has(person.id));
  const requestedIds = [
    ...sampleIds,
    ...extraMatches.slice(0, searchLimit).map(({ id }) => id),
  ];
  const activityKey = queryKeys.peopleDashboardActivity(requestedIds);
  const focused = useScreenFocus(activityKey);
  const activity = useQuery({
    queryKey: activityKey,
    enabled: focused && requestedIds.length > 0,
    queryFn: async (context) =>
      await loadDashboardActivity({
        client,
        batches: [
          ...chunkPersonIds(
            extraMatches.slice(0, searchLimit).map(({ id }) => id),
            16
          ),
          ...chunkPersonIds(sampleIds, 16),
        ],
        signal: context.signal,
        read: async (personIds) =>
          await callForQuery(
            context,
            async (options) =>
              await rpc.call("people.dashboardActivity", { personIds }, options)
          ),
        publish: (people) => {
          client.setQueryData(activityKey, people);
        },
      }),
  });
  const members = scopePeople.flatMap((person) => {
    const facts = activity.data?.find(({ id }) => id === person.id);
    return facts ? [toDashboardPerson(person, facts)] : [];
  });
  const health = computeTeamHealth(
    members.filter((person) => sampleSet.has(person.id)),
    roster.data?.teams ?? [],
    formatCalendarDayInTimeZone(new Date(), account.timeZone)
  );
  const term = normalizePeopleQuery(search);
  const people = visiblePeople({
    scopePeople,
    members,
    term,
    sampleSet,
    health,
    category,
    view,
    selectedDay,
  });
  const scopeLabel = describeScope(scope, roster.data?.teams ?? []);
  const selectScope = (next: PeopleDashboardScope): void => {
    client.setQueryData(scopeKey, next);
    setExtra(0);
    setSearchLimit(16);
    setChoosingTeam(false);
  };
  return {
    roster,
    activity,
    scope,
    choosingTeam,
    setChoosingTeam,
    view,
    setView,
    category,
    setCategory,
    search,
    setSearch,
    settledSearch,
    extra,
    setExtra,
    searchLimit,
    setSearchLimit,
    selectedDay,
    setSelectedDay,
    sampleCount,
    scopeIds,
    health,
    members,
    people,
    scopeLabel,
    selectScope,
    term,
    extraMatches,
  };
};

export const PeopleScreen = () => {
  const {
    roster,
    activity,
    scope,
    choosingTeam,
    setChoosingTeam,
    view,
    setView,
    category,
    setCategory,
    search,
    setSearch,
    settledSearch,
    extra,
    setExtra,
    searchLimit,
    setSearchLimit,
    selectedDay,
    setSelectedDay,
    sampleCount,
    scopeIds,
    health,
    members,
    people,
    scopeLabel,
    selectScope,
    term,
    extraMatches,
  } = usePeopleDashboard();
  return (
    <Screen
      title="People"
      refresh={() => {
        void roster.refetch();
        void activity.refetch();
      }}
      fetching={roster.isRefetching}
    >
      <ReadState query={roster}>
        <Field
          label="Search people, teams and roles"
          value={search}
          onChangeText={setSearch}
        />
        <Choice values={["Health", "Month"]} value={view} onChange={setView} />
        <Action
          label={`Scope: ${scopeLabel ?? "All teams"}`}
          onPress={() => {
            setChoosingTeam(!choosingTeam);
          }}
        />
        {choosingTeam ? (
          <Card title="Scope">
            <Action
              label="All teams"
              selected={scope === "all"}
              onPress={() => {
                selectScope("all");
              }}
            />
            {(roster.data?.ledTeamIds.length ?? 0) > 0 ? (
              <Action
                label="Teams you lead"
                selected={scope === "mine"}
                onPress={() => {
                  selectScope("mine");
                }}
              />
            ) : null}
            {roster.data?.teams.map((team) => (
              <Action
                key={team.id}
                label={team.name}
                selected={scope === teamScope(team.id)}
                onPress={() => {
                  selectScope(teamScope(team.id));
                }}
              />
            ))}
          </Card>
        ) : null}
        <Label secondary>
          {roster.data?.month.label}: {sampleCount} of {scopeIds.length} people
          requested, {health.memberCount} loaded in the sample
        </Label>
        {activity.isFetching ? (
          <Label secondary>Loading serving activity…</Label>
        ) : null}
        {activity.error ? <ReadState query={activity}>{null}</ReadState> : null}
        {view === "Health" ? (
          <>
            <Card title="Team health">
              <Label>{health.status ?? "Not enough activity to judge"}</Label>
              <Label secondary>
                {health.activeCount} active, {health.scheduledAheadCount}{" "}
                scheduled ahead, {health.checkIns.length} to check in with,{" "}
                {health.waitingOnReply.length} waiting on reply
              </Label>
            </Card>
            <Choice
              values={[
                "Everyone",
                "Check in",
                "Waiting on reply",
                "Due for a slot",
              ]}
              value={category}
              onChange={setCategory}
            />
          </>
        ) : (
          <Choice
            values={[
              "All days",
              ...serviceDays(buildMonthDays(members)).map(String),
            ]}
            value={selectedDay}
            onChange={setSelectedDay}
          />
        )}
        {people.map((person) => (
          <DashboardPersonCard
            key={person.id}
            person={person}
            facts={members.find(({ id }) => id === person.id)}
            view={view}
            selectedDay={selectedDay}
            monthLabel={roster.data?.month.label ?? "Month"}
            health={health}
          />
        ))}
        {term === "" && sampleCount < scopeIds.length ? (
          <Action
            label="Load 48 more people"
            disabled={activity.isFetching}
            onPress={() => {
              setExtra(extra + PEOPLE_DASHBOARD_SAMPLE_SIZE);
            }}
          />
        ) : null}
        {term !== "" && extraMatches.length > searchLimit ? (
          <Action
            label="Load 16 more matches"
            disabled={activity.isFetching || term !== settledSearch}
            onPress={() => {
              setSearchLimit(searchLimit + 16);
            }}
          />
        ) : null}
      </ReadState>
    </Screen>
  );
};
const ServingRhythmCard = ({
  person,
}: {
  person: PeopleDashboardPersonDetail["person"] | undefined;
}) => (
  <Card title="Serving rhythm">
    <Label>{person?.teams.join(", ")}</Label>
    <Label>
      {person?.rhythm.servedDays30 ?? 0} serving days in the last month
    </Label>
    <Label secondary>
      Last served: {person?.rhythm.lastServedOn ?? "Unknown"}
    </Label>
    <Label secondary>
      Next serving: {person?.rhythm.nextServingOn ?? "No upcoming plans"}
    </Label>
    <Label secondary>
      Typical gap: {person?.rhythm.typicalGapDays ?? "Unknown"} days
    </Label>
  </Card>
);

export const PersonScreen = () => {
  const { personId, month: linkedMonth } = useLocalSearchParams<{
    personId: string;
    month?: string;
  }>();
  const [month, setMonth] = useState<string | null>(linkedMonth ?? null);
  const account = useAccount();
  const detail = useRpcQuery(
    "people.dashboardPerson",
    { personId, month: month ?? undefined },
    queryKeys.peopleDashboardPerson(personId, month),
    account.features.data?.people === true
  );
  const blockouts = useRpcQuery(
    "people.blockouts",
    { personId },
    queryKeys.blockouts(personId)
  );
  return (
    <Screen
      title={detail.data?.person.name ?? "Person"}
      refresh={() => {
        void detail.refetch();
        void blockouts.refetch();
      }}
      fetching={detail.isRefetching}
    >
      {account.features.data?.people === true ? (
        <ReadState query={detail}>
          <ServingRhythmCard person={detail.data?.person} />
          <Card title={detail.data?.month.label}>
            <Choice
              values={["Previous month", "Next month"]}
              value=""
              onChange={(value) => {
                setMonth(
                  value === "Previous month"
                    ? (detail.data?.previousMonth ?? null)
                    : (detail.data?.nextMonth ?? null)
                );
              }}
            />
            {detail.data?.person.monthDays.map((day) => (
              <Row
                key={`${day.day}-${day.positionName}-${day.serviceTypeName}-${day.kind}-${day.status}-${day.planUrl}`}
                title={`Day ${day.day}, ${day.kind}`}
                detail={[day.positionName, day.serviceTypeName, day.status]
                  .filter(Boolean)
                  .join(", ")}
                onPress={
                  day.planUrl === undefined
                    ? undefined
                    : () => {
                        openPlanLink(day.planUrl);
                      }
                }
              />
            ))}
            {(detail.data?.requestBudget.unresolvedRehearsalTimes ?? 0) > 0 ? (
              <Label secondary>
                Some rehearsal times are still unavailable.
              </Label>
            ) : null}
          </Card>
        </ReadState>
      ) : (
        <Label secondary>
          Serving activity is unavailable for this account. Blockouts remain
          available.
        </Label>
      )}
      <Card title="Blockouts">
        <ReadState query={blockouts}>
          {blockouts.data?.length === 0 ? (
            <Label secondary>No upcoming blockouts.</Label>
          ) : null}
          {blockouts.data?.map((blockout) => (
            <Row
              key={blockout.id}
              title={blockout.reason}
              detail={`${formatCalendarDateLabel(blockout.startsAt, blockout.timeZone ?? account.timeZone, "weekdayMonthDay")} to ${formatCalendarDateLabel(blockout.endsAt, blockout.timeZone ?? account.timeZone, "weekdayMonthDay")}: ${blockout.description}`}
            />
          ))}
        </ReadState>
      </Card>
      <Action
        label="Open in Planning Center"
        onPress={() => {
          void Linking.openURL(
            `https://people.planningcenteronline.com/people/${personId}`
          );
        }}
      />
    </Screen>
  );
};
