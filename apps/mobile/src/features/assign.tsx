import { queryKeys } from "@pcobooster/client/query-keys";
import type { TeamPositionGroup } from "@pcobooster/contracts/catalog";
import { serviceTypeAbilities } from "@pcobooster/planning-center-models/access";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { useAssignmentCandidates } from "../assign-data";
import { selectedCustomSlot } from "../assign-slot";
import { CandidateDetail } from "../components/candidate-detail";
import {
  Action,
  Card,
  Field,
  Label,
  ReadState,
  Row,
  Screen,
  Toggle,
  useDebounced,
} from "../components/ui";
import { useAccount, useRpcMutation, useRpcQuery } from "../runtime";
import { tabRouter as router } from "../tab-router";

const PositionSelector = ({
  groups,
  positionName,
  slot,
  onSelect,
}: {
  groups: readonly TeamPositionGroup[];
  positionName: string | undefined;
  slot: { teamId: string; positionId: string };
  onSelect: (slot: { teamId: string; positionId: string }) => void;
}) => {
  const [open, setOpen] = useState(slot.positionId.length === 0);
  return (
    <>
      <Action
        label={`Position: ${positionName ?? "Choose a position"}`}
        onPress={() => {
          setOpen((current) => !current);
        }}
      />
      {open ? (
        <Card title="Position">
          {groups.map((group) => (
            <Card key={group.teamId} title={group.teamName}>
              {group.positions.map((item) => (
                <Action
                  key={item.id}
                  label={item.name}
                  selected={item.id === slot.positionId}
                  onPress={() => {
                    onSelect({ teamId: group.teamId, positionId: item.id });
                    setOpen(false);
                  }}
                />
              ))}
            </Card>
          ))}
        </Card>
      ) : null}
    </>
  );
};

const CandidateRows = ({
  people,
  canSchedule,
  busy,
  schedule,
  planDate,
  positionName,
  timeZone,
}: {
  people: readonly PersonWithAvailability[];
  canSchedule: boolean;
  busy: boolean;
  schedule: (personId: string, oneOff: boolean) => void;
  planDate: Date | undefined;
  positionName: string | undefined;
  timeZone: string;
}) => (
  <>
    {people.map((person) => (
      <Row
        key={person.id}
        title={person.fullName}
        detail={`${person.availability}${person.frequency ? `, ${person.frequency.recentServedDays} recent serving days` : ""}`}
      >
        <Action
          label={
            person.isScheduledForSelectedPlanPosition === true
              ? `${person.fullName} is already scheduled here`
              : `Schedule ${person.fullName}`
          }
          disabled={
            !canSchedule ||
            busy ||
            person.availability !== "available" ||
            person.isScheduledForSelectedPlanPosition === true
          }
          onPress={() => {
            schedule(person.id, false);
          }}
        />
        <CandidateDetail
          person={person}
          planDate={planDate}
          positionName={positionName}
          timeZone={timeZone}
        />
      </Row>
    ))}
  </>
);

const CandidateSection = ({
  state,
  canSchedule,
  busy,
  schedule,
  timeZone,
}: {
  state: ReturnType<typeof useAssignmentCandidates>;
  canSchedule: boolean;
  busy: boolean;
  schedule: (personId: string, oneOff: boolean) => void;
  timeZone: string;
}) => {
  const { candidates, history, details, list, plan, position } = state;
  return (
    <ReadState query={candidates}>
      <Card title="Candidates">
        {history.isPending || details.isPending ? (
          <Label secondary>Loading serving history and availability…</Label>
        ) : null}
        {history.error ? <ReadState query={history}>{null}</ReadState> : null}
        {details.error ? <ReadState query={details}>{null}</ReadState> : null}
        <CandidateRows
          people={list?.people ?? []}
          canSchedule={canSchedule}
          busy={busy}
          schedule={schedule}
          planDate={plan.data?.sortDate ?? undefined}
          positionName={position?.name}
          timeZone={timeZone}
        />
      </Card>
    </ReadState>
  );
};

export const AssignScreen = () => {
  const params = useLocalSearchParams<{
    serviceTypeId: string;
    planId: string;
    teamId: string;
    positionId: string;
    positionName?: string;
    source?: string;
  }>();
  const account = useAccount();
  const [someoneElse, setSomeoneElse] = useState("");
  const term = useDebounced(someoneElse.trim());
  const [oneOff, setOneOff] = useState(false);
  const [slot, setSlot] = useState({
    teamId: params.teamId ?? "",
    positionId: params.positionId ?? "",
  });
  const candidateState = useAssignmentCandidates(params, slot);
  const { groups, candidates, history, details, position } = candidateState;
  const search = useRpcQuery(
    "people.search",
    { query: term },
    queryKeys.peopleSearch(term),
    term.length >= 2 && account.access.data?.people.status === "granted"
  );
  const assign = useRpcMutation("schedule.assign");
  const abilities = account.access.data
    ? serviceTypeAbilities(account.access.data, params.serviceTypeId)
    : null;
  const canSchedule = !account.readOnly && abilities?.scheduleLedTeams === true;

  const custom = selectedCustomSlot(params, slot);
  const positionName =
    position?.name ?? (custom ? params.positionName : undefined);
  const schedule = (personId: string, isOneOff: boolean) => {
    assign.mutate(
      {
        ...params,
        ...slot,
        personId,
        oneOff: isOneOff || custom,
        positionName,
      },
      {
        onSuccess: () => {
          router.back();
        },
      }
    );
  };
  return (
    <Screen
      title="Assign"
      refresh={() => {
        void candidates.refetch();
        void history.refetch();
        void details.refetch();
      }}
    >
      <PositionSelector
        groups={groups.data ?? []}
        positionName={positionName}
        slot={slot}
        onSelect={setSlot}
      />
      {canSchedule ? null : (
        <Label secondary>This plan is view-only for your account.</Label>
      )}
      {custom ? (
        <Label secondary>
          Choose someone below to add this custom position for this plan.
        </Label>
      ) : (
        <CandidateSection
          state={candidateState}
          canSchedule={canSchedule}
          busy={assign.isPending}
          schedule={schedule}
          timeZone={account.timeZone}
        />
      )}
      {account.access.data?.people.status === "granted" ? (
        <Card title="Someone else">
          <Field
            label="Search people"
            value={someoneElse}
            onChangeText={setSomeoneElse}
          />
          <Toggle
            label="Add for this plan only"
            checked={oneOff}
            onChange={setOneOff}
          />
          {term.length >= 2 ? (
            <ReadState query={search}>
              {search.data?.map((person) => (
                <Action
                  key={person.id}
                  label={`Schedule ${person.fullName}`}
                  disabled={!canSchedule || assign.isPending}
                  onPress={() => {
                    schedule(person.id, oneOff);
                  }}
                />
              ))}
            </ReadState>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
};
