import { AlreadyScheduled } from "@pcobooster/contracts/faults/already-scheduled";
import { insertCustomPosition } from "@pcobooster/planning-center-models/custom-position";
import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

import type { AppClient } from "../../app-shell/app-client";
import {
  addRosterPerson,
  locateRosterPerson,
  restoreRosterPerson,
} from "./assign-person";
import type { AssignPerson, RosterPersonLocation } from "./assign-person";
import { assignmentKey } from "./assignment";
import type { AssignmentIdentity, RosterAssignment } from "./assignment";
import { PlanContentWriter } from "./content-writes";
import { OptimisticList } from "./optimistic-list";
import {
  requireSavedRequestIds,
  PlaceholderIdError,
  makePlaceholderIds,
} from "./placeholder-ids";
import { planReads } from "./reads";
import type { PlanIds } from "./reads";
import { PlanReconciler, realTimer } from "./reconcile";
import type { ReconcileTimer } from "./reconcile";
import {
  adjustOpenSlots,
  canAddSlot,
  canRemoveSlot,
  editRosterPerson,
  statusCodes,
} from "./roster";
import type { PersonStatus } from "./roster";
import {
  clearSlot,
  removeWindowRows,
  scheduleCandidate,
  setSlotStatus,
  setWindowRowStatus,
} from "./schedule-optimism";
import type { CandidatesData, HistoryData } from "./schedule-optimism";

type RosterChange = (groups: TeamPositionGroup[]) => TeamPositionGroup[];
/** One write's optimistic edit to every cached read it touches. */
interface ScheduleChange {
  roster: RosterChange;
  candidates?: (data: CandidatesData, key: QueryKey) => CandidatesData;
  history?: (calls: HistoryData) => HistoryData;
}
type Entries<Data> = Map<string, [QueryKey, Data]>;
/** Scheduled, already on the position, or the failure to show under the row. */
export type AssignResult = "scheduled" | "already" | Error;

const OPTIMISTIC_PREFIX = "optimistic:";
/** Transport identity is data, never a lookup key or an optimistic edit selector. */
interface AssignmentState {
  identity: AssignmentIdentity;
  location: RosterPersonLocation;
  transport:
    | { kind: "saving" }
    | { kind: "saved"; id: string }
    | { kind: "unresolved" }
    | { kind: "absent" };
}

interface PersonContext {
  personId?: string;
}
const personContext = (person: FilledPositionPerson): PersonContext => {
  const context: PersonContext = {};
  if (person.personId !== null && person.personId !== undefined) {
    context.personId = person.personId;
  }
  return context;
};

/** A transport write that ran, or was skipped because the assignment it needed never saved. */
type Performed = "saved" | "skipped";
type Outcome = Performed | Error;

const entries = <Data>(pairs: [QueryKey, Data | undefined][]): Entries<Data> =>
  new Map(
    pairs.flatMap(([key, data]) =>
      data === undefined ? [] : [[JSON.stringify(key), [key, data]] as const]
    )
  );

/** A custom position a refetch dropped before its first assignment comes back with it. */
const withCustomPosition = (
  groups: TeamPositionGroup[],
  position: TeamPosition
): TeamPositionGroup[] =>
  position.source !== "custom" ||
  groups.some(
    (group) =>
      group.teamId === position.teamId &&
      group.positions.some((slot) => slot.id === position.id)
  )
    ? groups
    : (insertCustomPosition(groups, position.teamId, position.name)?.groups ??
      groups);

/**
 * Optimistic edits apply immediately; transport writes share one ordered queue. Each edit
 * changes the lineup, the plan's cached candidate lists, and window histories; when the queue
 * drains, those reads and history-carrying candidate details refetch (Swift's `settleFilters`).
 */
export class PlanWriter {
  private readonly assignments = new Map<string, AssignmentState>();
  readonly content: PlanContentWriter;
  /** Successful removals stay retired when the stable identity gets a later Assign state. */
  private readonly removedAssignmentIds = new Set<string>();
  readonly placeholders = makePlaceholderIds();
  private readonly reconciler: PlanReconciler;
  private readonly roster: OptimisticList<TeamPositionGroup>;
  private readonly enqueue: (job: () => Promise<boolean>) => Promise<boolean>;
  private candidateBase: Entries<CandidatesData> = new Map();
  private historyBase: Entries<HistoryData> = new Map();
  private readonly pending: ScheduleChange[] = [];
  private assignmentSerial = 0;
  private tail: Promise<boolean> = Promise.resolve(true);
  private readonly client: AppClient;
  private readonly cache: QueryClient;
  private readonly scope: string;
  private readonly ids: PlanIds;
  private readonly onError: (error: Error) => void;
  private readonly onSuccess: () => void;
  constructor(
    client: AppClient,
    cache: QueryClient,
    scope: string,
    ids: PlanIds,
    onError: (error: Error) => void,
    onSuccess: () => void,
    timer: ReconcileTimer = realTimer
  ) {
    this.client = client;
    this.reconciler = new PlanReconciler(cache, timer);
    this.cache = cache;
    this.scope = scope;
    this.ids = ids;
    this.onError = onError;
    this.onSuccess = onSuccess;
    const enqueue = async (job: () => Promise<boolean>) => {
      const previous = this.tail;
      const result = (async () => {
        await previous;
        return await job();
      })();
      this.tail = result;
      return await result;
    };
    this.enqueue = enqueue;
    this.roster = new OptimisticList(
      cache,
      this.key,
      enqueue,
      onError,
      onSuccess,
      this.reconciler,
      [
        { queryKey: [scope, "people.myScheduledPlans"] },
        this.candidateFilter,
        this.historyFilter,
        this.historyDetailsFilter,
      ],
      (change) => {
        for (const state of this.assignments.values()) {
          const synthetic = [
            {
              teamId: state.location.position.teamId,
              teamName: "",
              positions: [
                {
                  ...state.location.position,
                  filledPeople: [state.location.person],
                },
              ],
            },
          ];
          const updated = change(synthetic)[0]?.positions[0]?.filledPeople?.[0];
          if (updated !== undefined) {
            state.location = { ...state.location, person: updated };
          }
        }
      }
    );
    this.content = new PlanContentWriter(
      this.placeholders,
      this.client,
      cache,
      scope,
      ids,
      enqueue,
      onError,
      onSuccess,
      this.reconciler,
      this.roster,
      async (id) => {
        const resolvedId = this.placeholders.resolve(id);
        const state = [...this.assignments.values()].find(
          (candidate) =>
            candidate.location.person.planPersonId === id ||
            candidate.location.person.planPersonId === resolvedId
        );
        if (state !== undefined) {
          const saved = await this.savedAssignment(state, state.identity);
          if (saved !== undefined) {
            return saved;
          }
          throw new PlaceholderIdError(id);
        }
        const savedId = this.placeholders.require(id);
        if (this.removedAssignmentIds.has(savedId)) {
          throw new PlaceholderIdError(id);
        }
        return savedId;
      }
    );
  }

  private get key() {
    return planReads.groups(
      { client: this.client, scope: this.scope },
      this.ids
    ).queryKey;
  }

  /** Assign's candidate lists for this plan (`assignReads.candidates`). */
  private get candidateFilter() {
    return {
      queryKey: [
        this.scope,
        "people.positionCandidates",
        this.ids.serviceTypeId,
      ],
      predicate: (query: Query) => query.queryKey[5] === this.ids.planId,
    };
  }

  /** Window histories (`assignReads.history`). */
  private get historyFilter() {
    return { queryKey: [this.scope, "people.planWindowHistory"] };
  }

  /** Candidate details that carry schedule history (`assignReads.details`); blockouts stay. */
  private get historyDetailsFilter() {
    return {
      queryKey: [this.scope, "people.candidateDetails"],
      predicate: (query: Query) => query.queryKey[5] === true,
    };
  }

  /** Capture an existing assignment by its stable slot/person identity, including declines. */
  private assignment({
    identity,
    person,
  }: RosterAssignment): AssignmentState | undefined {
    if (identity.planId !== this.ids.planId) {
      return undefined;
    }
    const key = assignmentKey(identity);
    const located = locateRosterPerson(
      this.cache.getQueryData<TeamPositionGroup[]>(this.key) ?? [],
      identity
    );
    const existing = this.assignments.get(key);
    if (
      !this.roster.hasPending &&
      located !== undefined &&
      !located.person.planPersonId.startsWith(OPTIMISTIC_PREFIX)
    ) {
      const fresh: AssignmentState = {
        identity,
        location: located,
        transport: { kind: "saved", id: located.person.planPersonId },
      };
      this.assignments.set(key, fresh);

      return fresh;
    }
    if (
      existing !== undefined &&
      (existing.transport.kind !== "absent" || located === undefined)
    ) {
      return existing;
    }
    // Assign's candidate can name a declined person absent from the visible lineup.
    const position = this.cache
      .getQueryData<TeamPositionGroup[]>(this.key)
      ?.find((group) => group.teamId === identity.teamId)
      ?.positions.find((slot) => slot.id === identity.positionId);
    if (
      position === undefined ||
      person.planPersonId.startsWith(OPTIMISTIC_PREFIX)
    ) {
      return undefined;
    }
    const acknowledged = locateRosterPerson(this.roster.acknowledged, identity);
    const savedLocation =
      located !== undefined &&
      !located.person.planPersonId.startsWith(OPTIMISTIC_PREFIX)
        ? located
        : undefined;
    const location = acknowledged ?? savedLocation ?? { position, person };
    const state: AssignmentState = {
      identity,
      location,
      transport: { kind: "saved", id: location.person.planPersonId },
    };
    this.assignments.set(key, state);

    return state;
  }

  /** A duplicate assignment has no ID in the write response; one selected-slot read resolves it. */
  private async savedAssignment(
    state: AssignmentState,
    identity: AssignmentIdentity
  ): Promise<string | undefined> {
    if (state.transport.kind === "absent") {
      return undefined;
    }
    if (state.transport.kind === "unresolved") {
      const targetClientNative1 = this.client;
      const inputNative1 = {
        ...this.ids,
        teamId: identity.teamId,
        positionId: identity.positionId,
      };
      requireSavedRequestIds(inputNative1);
      const candidates = await targetClientNative1.run((api) =>
        api.people.positionCandidates({
          params: inputNative1,
          query: inputNative1,
        })
      );
      const slot = candidates.candidates.find(
        (person) => person.id === identity.personId
      )?.selectedPlanSlot;
      if (
        slot === null ||
        slot === undefined ||
        slot.planPersonId.startsWith(OPTIMISTIC_PREFIX)
      ) {
        throw new Error(
          "This assignment could not be found. Refresh the plan and try again."
        );
      }
      this.placeholders.land(
        state.location.person.planPersonId,
        slot.planPersonId
      );
      state.transport = { kind: "saved", id: slot.planPersonId };

      state.location = {
        ...state.location,
        person: {
          ...state.location.person,
          planPersonId: slot.planPersonId,
          status: slot.status === "confirmed" ? "confirmed" : "pending",
          rawStatus: statusCodes[slot.status],
        },
      };
      // Update the acknowledged assign as well as every queued closure sharing this state.
      this.roster.commit((groups) =>
        editRosterPerson(
          groups.map((group) => ({
            ...group,
            positions: group.positions.map((position) =>
              position.teamId === identity.teamId &&
              position.id === identity.positionId
                ? {
                    ...position,
                    filledPeople: position.filledPeople?.map((person) =>
                      (person.personId ?? person.id) === identity.personId
                        ? { ...person, planPersonId: slot.planPersonId }
                        : person
                    ),
                  }
                : position
            ),
          })),
          identity,
          slot.status
        )
      );
      for (const [hash, [key, data]] of this.candidateBase) {
        if (key[3] === identity.teamId && key[4] === identity.positionId) {
          this.candidateBase.set(hash, [
            key,
            {
              ...data,
              candidates: data.candidates.map((candidate) =>
                candidate.id === identity.personId &&
                candidate.selectedPlanSlot !== null
                  ? {
                      ...candidate,
                      selectedPlanSlot: slot,
                    }
                  : candidate
              ),
            },
          ]);
        }
      }
      this.reapply();
    }
    if (state.transport.kind !== "saved") {
      throw new Error("This assignment has not finished saving. Try again.");
    }
    return state.transport.id;
  }

  private reapply(): void {
    for (const [key, data] of this.candidateBase.values()) {
      let candidates = data;
      for (const change of this.pending) {
        candidates = change.candidates?.(candidates, key) ?? candidates;
      }
      this.cache.setQueryData(key, candidates);
    }
    for (const [key, data] of this.historyBase.values()) {
      let calls = data;
      for (const change of this.pending) {
        calls = change.history?.(calls) ?? calls;
      }
      this.cache.setQueryData(key, calls);
    }
  }

  private commit(change: ScheduleChange): void {
    for (const [hash, [key, data]] of this.candidateBase) {
      this.candidateBase.set(hash, [
        key,
        change.candidates?.(data, key) ?? data,
      ]);
    }
    for (const [hash, [key, data]] of this.historyBase) {
      this.historyBase.set(hash, [key, change.history?.(data) ?? data]);
    }
  }

  private async write(
    change: ScheduleChange,
    perform: () => Promise<Performed>
  ): Promise<Outcome> {
    const transaction = this.roster.stage(change.roster);
    const cancelled = Promise.all([
      this.cache.cancelQueries(this.candidateFilter),
      this.cache.cancelQueries(this.historyFilter),
    ]);
    if (this.pending.length === 0) {
      this.candidateBase = entries(
        this.cache.getQueriesData<CandidatesData>(this.candidateFilter)
      );
      this.historyBase = entries(
        this.cache.getQueriesData<HistoryData>(this.historyFilter)
      );
    }
    this.pending.push(change);
    this.reapply();
    let outcome: Outcome = "skipped";
    await this.enqueue(async () => {
      await transaction.ready;
      await cancelled;
      this.reapply();
      try {
        outcome = await perform();
        if (outcome === "saved") {
          this.commit(change);
          this.onSuccess();
        }
      } catch (error) {
        outcome =
          error instanceof Error ? error : new Error("Something went wrong.");
        this.onError(outcome);
      } finally {
        this.pending.splice(this.pending.indexOf(change), 1);
        transaction.finish(outcome === "saved" ? change.roster : null);
        this.reapply();
      }
      return outcome === "saved";
    });
    return outcome;
  }

  addPosition(teamId: string, name: string): TeamPosition | undefined {
    const result = insertCustomPosition(this.roster.acknowledged, teamId, name);
    if (result === undefined) {
      return undefined;
    }
    this.roster.commit((groups) => withCustomPosition(groups, result.position));
    return result.position;
  }

  async adjust(
    position: TeamPosition,
    change: "add" | "remove"
  ): Promise<boolean> {
    const current =
      this.cache
        .getQueryData<TeamPositionGroup[]>(this.key)
        ?.find((group) => group.teamId === position.teamId)
        ?.positions.find((candidate) => candidate.id === position.id) ??
      position;
    if (!(change === "add" ? canAddSlot(current) : canRemoveSlot(current))) {
      return false;
    }
    const outcome = await this.write(
      {
        roster: (groups) =>
          adjustOpenSlots(groups, position.teamId, position.id, change),
      },
      async () => {
        const targetClientNative2 = this.client;
        const inputNative2 = {
          ...this.ids,
          teamId: position.teamId,
          positionName: position.name,
          change,
        };
        requireSavedRequestIds(inputNative2);
        await targetClientNative2.run((api) =>
          api.neededPositions.adjust({
            params: inputNative2,
            payload: inputNative2,
          })
        );
        return "saved";
      }
    );
    return outcome === "saved";
  }

  /** Someone already on the position counts as scheduled, as Planning Center's answer does. */
  async assign(
    person: AssignPerson,
    position: TeamPosition,
    teamName: string,
    oneOff: boolean
  ): Promise<AssignResult> {
    const current = this.cache
      .getQueryData<TeamPositionGroup[]>(this.key)
      ?.find((group) => group.teamId === position.teamId)
      ?.positions.find((slot) => slot.id === position.id);
    if (current?.filledPeople?.some((p) => p.personId === person.id) === true) {
      return "already";
    }
    this.assignmentSerial += 1;
    const optimisticId = `${OPTIMISTIC_PREFIX}${this.ids.planId}:${position.teamId}:${position.id}:${person.id}:${this.assignmentSerial}`;
    const identity: AssignmentIdentity = {
      planId: this.ids.planId,
      teamId: position.teamId,
      positionId: position.id,
      personId: person.id,
    };
    // The snapshot is keyed once, before the assign or any dependent edit can run.
    const optimisticPerson: FilledPositionPerson = {
      id: person.id,
      personId: person.id,
      planPersonId: optimisticId,
      name: person.fullName,
      photoThumbnailUrl: person.photoThumbnailUrl,
      status: "pending",
      rawStatus: "U",
      notification: { prepared: true, sentAt: null, senderName: null },
    };
    const state: AssignmentState = {
      identity,
      location: { position, person: optimisticPerson },
      transport: { kind: "saving" },
    };
    this.assignments.set(assignmentKey(identity), state);

    const outcome = await this.write(
      {
        roster: (groups) =>
          addRosterPerson(
            withCustomPosition(groups, position),
            position,
            person,
            state.location.person.planPersonId
          ),
        candidates: (data, key) =>
          key[3] === position.teamId && key[4] === position.id
            ? scheduleCandidate(
                data,
                person,
                state.location.person.planPersonId
              )
            : data,
      },
      async () => {
        try {
          const targetClientNative3 = this.client;
          const inputNative3 = {
            ...this.ids,
            personId: person.id,
            teamId: position.teamId,
            positionId: position.id,
            teamName,
            positionName: position.name,
            oneOff,
          };
          requireSavedRequestIds(inputNative3);
          const result = await targetClientNative3.run((api) =>
            api.schedule.assign({ params: inputNative3, payload: inputNative3 })
          );
          state.transport = { kind: "saved", id: result.data.id };
          this.placeholders.land(optimisticId, result.data.id);

          state.location = {
            ...state.location,
            person: { ...state.location.person, planPersonId: result.data.id },
          };
        } catch (error) {
          state.transport = { kind: "absent" };
          if (!(error instanceof AlreadyScheduled)) {
            throw error;
          }
          state.transport = { kind: "unresolved" };
          // AlreadyScheduled is success, but its unknown id waits for authoritative reads.
        }
        return "saved";
      }
    );
    return outcome instanceof Error ? outcome : "scheduled";
  }

  async setStatus(
    assignment: RosterAssignment,
    status: PersonStatus
  ): Promise<boolean> {
    const state = this.assignment(assignment);
    if (state === undefined || state.transport.kind === "absent") {
      return false;
    }
    const { identity } = assignment;
    const teamName = this.cache
      .getQueryData<TeamPositionGroup[]>(this.key)
      ?.find((group) => group.teamId === identity.teamId)?.teamName;
    const outcome = await this.write(
      {
        roster: (groups) => {
          if (state.transport.kind === "absent") {
            return groups;
          }
          return editRosterPerson(
            status === "declined"
              ? groups
              : restoreRosterPerson(groups, state.location),
            identity,
            status
          );
        },
        candidates: (data, key) =>
          state.transport.kind !== "absent" &&
          key[3] === identity.teamId &&
          key[4] === identity.positionId
            ? setSlotStatus(data, identity, status)
            : data,
        history: (calls) =>
          state.transport.kind === "absent"
            ? calls
            : setWindowRowStatus(
                calls,
                identity,
                state.location.position.name,
                status,
                teamName
              ),
      },
      async () => {
        const savedId = await this.savedAssignment(state, identity);
        if (savedId === undefined) {
          return "skipped";
        }
        const acknowledged = locateRosterPerson(
          this.roster.acknowledged,
          identity
        );
        if (acknowledged !== undefined) {
          state.location = acknowledged;
        }
        const targetClientNative4 = this.client;
        const inputNative4 = {
          ...this.ids,
          planPersonId: savedId,
          ...personContext(state.location.person),
          status: statusCodes[status],
        };
        requireSavedRequestIds(inputNative4);
        await targetClientNative4.run((api) =>
          api.schedule.updateStatus({
            params: inputNative4,
            payload: inputNative4,
          })
        );
        return "saved";
      }
    );
    return outcome === "saved";
  }

  async remove(assignment: RosterAssignment): Promise<boolean> {
    const state = this.assignment(assignment);
    if (state === undefined || state.transport.kind === "absent") {
      return false;
    }
    const { identity } = assignment;
    const teamName = this.cache
      .getQueryData<TeamPositionGroup[]>(this.key)
      ?.find((group) => group.teamId === identity.teamId)?.teamName;
    const outcome = await this.write(
      {
        roster: (groups) => editRosterPerson(groups, identity, "remove"),
        candidates: (data, key) =>
          key[3] === identity.teamId && key[4] === identity.positionId
            ? clearSlot(data, identity)
            : data,
        history: (calls) =>
          removeWindowRows(
            calls,
            identity,
            state.location.position.name,
            teamName
          ),
      },
      async () => {
        const savedId = await this.savedAssignment(state, identity);
        if (savedId === undefined) {
          return "skipped";
        }
        const targetClientNative5 = this.client;
        const inputNative5 = {
          ...this.ids,
          planPersonId: savedId,
          ...personContext(state.location.person),
        };
        requireSavedRequestIds(inputNative5);
        await targetClientNative5.run((api) =>
          api.schedule.remove({ params: inputNative5, query: inputNative5 })
        );
        this.removedAssignmentIds.add(savedId);
        state.transport = { kind: "absent" };
        return "saved";
      }
    );
    return outcome === "saved";
  }
}

const writers = new WeakMap<
  QueryClient,
  WeakMap<AppClient, Map<string, PlanWriter>>
>();

/** One queue for every surface editing this plan in the same account and cache. */
export const sharedPlanWriter = (
  client: AppClient,
  cache: QueryClient,
  scope: string,
  ids: PlanIds,
  onError: (error: Error) => void,
  onSuccess: () => void
): PlanWriter => {
  let clients = writers.get(cache);
  if (clients === undefined) {
    clients = new WeakMap();
    writers.set(cache, clients);
  }
  let plans = clients.get(client);
  if (plans === undefined) {
    plans = new Map();
    clients.set(client, plans);
  }
  const key = JSON.stringify([
    scope,
    ids.serviceTypeId,
    ids.planId,
    ids.seriesId,
  ]);
  let writer = plans.get(key);
  if (writer === undefined) {
    writer = new PlanWriter(client, cache, scope, ids, onError, onSuccess);
    plans.set(key, writer);
  }
  return writer;
};
