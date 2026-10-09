import {
  teamPositionGroupSchema,
  teamPositionsInputSchema,
} from "@pcobooster/contracts/http/catalog";
import { neededPositionsAdjustInputSchema } from "@pcobooster/contracts/http/needed-positions";
import {
  planWindowHistoryBatchSchema,
  positionCandidatesSchema,
} from "@pcobooster/contracts/http/people-schemas";
import { planTimesUpdateInputSchema } from "@pcobooster/contracts/http/plan-times";
import {
  scheduleAssignInputSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/http/schedule";
import { insertCustomPosition } from "@pcobooster/planning-center-models/custom-position";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { Schema } from "effect";
import type { Json } from "effect/Schema";

import type {
  AssignPerson,
  RosterPersonLocation,
} from "../features/plan/assign-person";
import {
  addRosterPerson,
  restoreRosterPerson,
} from "../features/plan/assign-person";
import { rosterAssignment } from "../features/plan/assignment";
import type { AssignmentIdentity } from "../features/plan/assignment";
import type { PersonStatus } from "../features/plan/roster";
import {
  adjustOpenSlots,
  editRosterPerson,
  openSlots,
} from "../features/plan/roster";
import {
  clearSlot,
  removeWindowRows,
  scheduleCandidate,
  setSlotStatus,
  setWindowRowStatus,
} from "../features/plan/schedule-optimism";
import type {
  CandidatesData,
  HistoryData,
} from "../features/plan/schedule-optimism";
import serviceTypeFixtures from "./fixtures/catalog.serviceTypes.json";
import candidateFixtures from "./fixtures/people.positionCandidates.json";
import searchFixtures from "./fixtures/people.search.json";

const fixtureStatuses = {
  C: "confirmed",
  U: "pending",
  D: "declined",
} as const;

const decodeGroups = Schema.decodeUnknownSync(
  Schema.mutable(Schema.Array(teamPositionGroupSchema))
);
const encodeJson = Schema.decodeUnknownSync(Schema.Json);
const encodeGroups = Schema.encodeSync(
  Schema.toCodecJson(Schema.Array(teamPositionGroupSchema))
);
const keyFor = (
  serviceTypeId: string,
  planId: string,
  account: string
): string => `${account}:${serviceTypeId}:${planId}`;

const editTimeAssignments = (
  groups: TeamPositionGroup[],
  input: typeof planTimesUpdateInputSchema.Type,
  removed: boolean
): TeamPositionGroup[] => {
  const assignedSlots = new Set(input.assignedNeededPositionIds);
  const clearedSlots = new Set(input.clearedNeededPositionIds);
  const assignedPeople = new Set(input.assignedPlanPersonIds);
  const clearedPeople = new Set(input.clearedPlanPersonIds);
  return groups.map((group) => ({
    ...group,
    positions: group.positions.map((position) => {
      let { timeId } = position;
      if (assignedSlots.has(position.neededPositionId ?? "")) {
        timeId = input.planTimeId;
      } else if (
        clearedSlots.has(position.neededPositionId ?? "") ||
        (removed && timeId === input.planTimeId)
      ) {
        timeId = null;
      }
      return {
        ...position,
        timeId,
        filledPeople: position.filledPeople?.map((person) => {
          const times = new Set(person.assignedTimeIds);
          if (assignedPeople.has(person.planPersonId)) {
            times.add(input.planTimeId);
          }
          if (removed || clearedPeople.has(person.planPersonId)) {
            times.delete(input.planTimeId);
          }
          return { ...person, assignedTimeIds: [...times] };
        }),
      };
    }),
  }));
};

const matchesRoster = (
  key: string,
  input: typeof scheduleRemoveInputSchema.Type,
  account: string
): boolean =>
  key.startsWith(`${account}:`) &&
  (input.planId === undefined ||
    input.serviceTypeId === undefined ||
    key === keyFor(input.serviceTypeId, input.planId, account));

const candidatesCodec = Schema.toCodecJson(positionCandidatesSchema);
const historyCodec = Schema.toCodecJson(planWindowHistoryBatchSchema);
const historyInput = Schema.Struct({
  serviceTypeId: Schema.optional(Schema.String),
});
const serviceTypeNames = new Map(
  serviceTypeFixtures.default.map(({ id, name }) => [id, name])
);

/**
 * One service type's share of the recorded window, as the API answers a call that names it:
 * its plans, the rows on them, and their times.
 */
const historyForServiceType = (
  batch: HistoryData[number],
  serviceTypeId: string | undefined
): HistoryData[number] => {
  if (serviceTypeId === undefined) {
    return batch;
  }
  const name = serviceTypeNames.get(serviceTypeId);
  const plans = batch.plans.filter(
    ({ serviceTypeName }) => serviceTypeName === name
  );
  const planIds = new Set(plans.map(({ id }) => id));
  const people = batch.people.flatMap(({ personId, rows }) => {
    const kept = rows.filter(
      ({ planId }) => planId !== null && planIds.has(planId)
    );
    return kept.length === 0 ? [] : [{ personId, rows: kept }];
  });
  const timeIds = new Set(
    people.flatMap(({ rows }) =>
      rows.flatMap(({ timeIds: times, serviceTimeIds }) => [
        ...times,
        ...serviceTimeIds,
      ])
    )
  );
  return {
    ...batch,
    plans,
    people,
    planTimes: batch.planTimes.filter(({ id }) => timeIds.has(id)),
    loadedPlanCount: plans.length,
  };
};
const slotInput = Schema.Struct({
  planId: Schema.String,
  teamId: Schema.String,
  positionId: Schema.String,
});

/** A saved write, replayed onto the candidate and history reads that follow it. */
type FixtureEdit =
  | {
      kind: "assign";
      planId: string;
      teamId: string;
      positionId: string;
      person: AssignPerson;
      planPersonId: string;
    }
  | {
      kind: PersonStatus | "remove";
      identity: AssignmentIdentity;
      positionName: string;
    };

/** Per-client fixture state: writes survive refetches, and never leave the device. */
export const makeFixtureRoster = () => {
  let account = "";
  let assignmentCount = 0;
  const knownPeople = new Map<string, RosterPersonLocation>();
  const names = new Map(
    [
      ...candidateFixtures.cases.flatMap<AssignPerson>(
        (entry) => entry.output.candidates
      ),
      ...searchFixtures.default,
    ].map((person) => [person.id, person])
  );
  const rosters = new Map<string, TeamPositionGroup[]>();
  const accountEdits = new Map<string, FixtureEdit[]>();
  let edits: FixtureEdit[] = [];
  const replayCandidates = (payload: Json, fixture: Json): Json => {
    if (edits.length === 0) {
      return fixture;
    }
    const input = Schema.decodeUnknownSync(slotInput)(payload);
    let data: CandidatesData =
      Schema.decodeUnknownSync(candidatesCodec)(fixture);
    for (const edit of edits) {
      if (edit.kind === "assign") {
        const matches =
          edit.planId === input.planId &&
          edit.teamId === input.teamId &&
          edit.positionId === input.positionId;
        data = matches
          ? scheduleCandidate(data, edit.person, edit.planPersonId)
          : data;
      } else if (
        edit.identity.planId === input.planId &&
        edit.identity.teamId === input.teamId &&
        edit.identity.positionId === input.positionId
      ) {
        data =
          edit.kind === "remove"
            ? clearSlot(data, edit.identity)
            : setSlotStatus(data, edit.identity, edit.kind);
      }
    }
    return encodeJson(Schema.encodeSync(candidatesCodec)(data));
  };
  const replayHistory = (payload: Json, fixture: Json): Json => {
    const { serviceTypeId } = Schema.decodeUnknownSync(historyInput)(payload);
    let calls: HistoryData = [
      historyForServiceType(
        Schema.decodeUnknownSync(historyCodec)(fixture),
        serviceTypeId
      ),
    ];
    for (const edit of edits) {
      if (edit.kind === "remove") {
        calls = removeWindowRows(calls, edit.identity, edit.positionName);
      } else if (edit.kind !== "assign") {
        calls = setWindowRowStatus(
          calls,
          edit.identity,
          edit.positionName,
          edit.kind
        );
      }
    }
    return encodeJson(Schema.encodeSync(historyCodec)(calls[0]));
  };
  const assignFixture = (payload: Json): Json => {
    const input = Schema.decodeUnknownSync(scheduleAssignInputSchema)(payload);
    const key = keyFor(input.serviceTypeId, input.planId, account);
    let groups = rosters.get(key) ?? [];
    if (
      input.positionId.startsWith("plan-member-position:") &&
      input.positionName !== undefined
    ) {
      groups =
        insertCustomPosition(groups, input.teamId, input.positionName)
          ?.groups ?? groups;
    }
    const position = groups
      .find((group) => group.teamId === input.teamId)
      ?.positions.find((slot) => slot.id === input.positionId);
    if (position === undefined) {
      throw new Error("The fixture position is missing");
    }
    assignmentCount += 1;
    const id = `fixture-assignment-${assignmentCount}`;
    const person = names.get(input.personId);
    edits.push({
      kind: "assign",
      planId: input.planId,
      teamId: input.teamId,
      positionId: input.positionId,
      person: {
        id: input.personId,
        fullName: person?.fullName ?? "Guest Musician",
        photoThumbnailUrl: person?.photoThumbnailUrl ?? null,
      },
      planPersonId: id,
    });
    rosters.set(
      key,
      addRosterPerson(
        groups,
        position,
        {
          id: input.personId,
          fullName: person?.fullName ?? "Guest Musician",
          photoThumbnailUrl: person?.photoThumbnailUrl ?? null,
        },
        id
      )
    );
    return { success: true, data: { id } };
  };
  const mutateStatus = (
    tag: "schedule.updateStatus" | "schedule.remove",
    payload: Json
  ) => {
    const input = Schema.decodeUnknownSync(scheduleRemoveInputSchema)(payload);
    const status =
      tag === "schedule.remove"
        ? "remove"
        : Schema.decodeUnknownSync(scheduleUpdateStatusInputSchema)(payload)
            .status;
    const mapped: PersonStatus | "remove" =
      status === "remove" ? "remove" : fixtureStatuses[status];
    for (const [key, groups] of rosters) {
      if (!matchesRoster(key, input, account)) {
        continue;
      }
      let located: RosterPersonLocation | undefined;
      for (const group of groups) {
        for (const position of group.positions) {
          const person = position.filledPeople?.find(
            (candidate) => candidate.planPersonId === input.planPersonId
          );
          if (person !== undefined) {
            located = { position, person };
          }
        }
      }
      if (located !== undefined) {
        knownPeople.set(`${account}:${input.planPersonId}`, located);
      }
      const known = knownPeople.get(`${account}:${input.planPersonId}`);
      if (known === undefined) {
        continue;
      }
      const { identity } = rosterAssignment(
        {
          planId: input.planId ?? key.split(":").at(-1) ?? "",
          serviceTypeId: input.serviceTypeId ?? "",
        },
        known.position,
        known.person
      );
      edits.push({ kind: mapped, identity, positionName: known.position.name });
      const restored =
        mapped !== "declined" && mapped !== "remove" && known !== undefined
          ? restoreRosterPerson(groups, known)
          : groups;
      rosters.set(key, editRosterPerson(restored, identity, mapped));
      if (mapped === "remove") {
        knownPeople.delete(`${account}:${input.planPersonId}`);
      }
    }
  };
  const mutateTime = (tag: string, payload: Json): void => {
    const input = Schema.decodeUnknownSync(
      Schema.toCodecJson(planTimesUpdateInputSchema)
    )(payload);
    const key = keyFor(input.serviceTypeId, input.planId, account);
    const groups = rosters.get(key);
    if (groups !== undefined) {
      rosters.set(
        key,
        editTimeAssignments(groups, input, tag === "planTimes.delete")
      );
    }
    for (const [savedKey, location] of knownPeople) {
      if (!savedKey.startsWith(`${account}:`)) {
        continue;
      }
      const changed = editTimeAssignments(
        [
          {
            teamId: location.position.teamId,
            teamName: "",
            positions: [
              { ...location.position, filledPeople: [location.person] },
            ],
          },
        ],
        input,
        tag === "planTimes.delete"
      );
      const person = changed[0]?.positions[0]?.filledPeople?.[0];
      if (person !== undefined) {
        knownPeople.set(savedKey, { ...location, person });
      }
    }
  };
  return (
    tag: string,
    payload: Json,
    fixture: Json,
    activeAccount: string
  ): Json => {
    account = activeAccount;
    edits = accountEdits.get(account) ?? [];
    accountEdits.set(account, edits);
    if (tag === "catalog.teamPositions") {
      const input = Schema.decodeUnknownSync(teamPositionsInputSchema)(payload);
      const key = keyFor(input.serviceTypeId, input.planId, account);
      const groups = rosters.get(key) ?? decodeGroups(fixture);
      rosters.set(key, groups);
      return encodeGroups(groups);
    }
    if (tag === "schedule.assign") {
      return assignFixture(payload);
    }
    if (tag === "people.positionCandidates") {
      return replayCandidates(payload, fixture);
    }
    if (tag === "people.planWindowHistory") {
      return replayHistory(payload, fixture);
    }
    if (tag === "planTimes.update" || tag === "planTimes.delete") {
      mutateTime(tag, payload);
      return fixture;
    }
    if (tag === "neededPositions.adjust") {
      const input = Schema.decodeUnknownSync(neededPositionsAdjustInputSchema)(
        payload
      );
      const key = keyFor(input.serviceTypeId, input.planId, account);
      const groups = rosters.get(key) ?? [];
      const position = groups
        .find((group) => group.teamId === input.teamId)
        ?.positions.find((candidate) => candidate.name === input.positionName);
      if (position === undefined) {
        return fixture;
      }
      const changed = adjustOpenSlots(
        groups,
        input.teamId,
        position.id,
        input.change
      );
      rosters.set(key, changed);
      return {
        openCount: openSlots(
          changed
            .find((group) => group.teamId === input.teamId)
            ?.positions.find((candidate) => candidate.id === position.id) ??
            position
        ),
      };
    }
    if (tag === "schedule.updateStatus" || tag === "schedule.remove") {
      mutateStatus(tag, payload);
    }

    return fixture;
  };
};
