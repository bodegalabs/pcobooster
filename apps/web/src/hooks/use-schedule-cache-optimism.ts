import type {
  PlanWindowHistoryBatch,
  PositionCandidates,
} from "@pcobooster/contracts/people-schemas";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type {
  PositionCandidate,
  SelectedPlanSlot,
} from "@pcobooster/planning-center-models/position-candidates";
import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import type {
  InvalidateQueryFilters,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";

import { clearCachedMyScheduledPlans } from "@/lib/my-scheduled-plans-cache";
import { clearCachedPeopleDashboards } from "@/lib/people-dashboard-cache";
import { clearCachedCandidateSchedules } from "@/lib/position-candidates-cache";
import { queryKeys } from "@/lib/query-keys";
import { clearCachedTeamPositions } from "@/lib/team-positions-cache";

export type OptimisticPlanPersonStatusCode = "C" | "U" | "D";

export interface OptimisticSchedulePerson {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  photoUrl?: string | null;
  photoThumbnailUrl?: string | null;
}

export interface OptimisticScheduleSlot {
  serviceTypeId: string;
  planId: string;
  teamId: string;
  positionId: string;
}

export interface ScheduleMutationInvalidateContext {
  serviceTypeId?: string | null;
  personId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
}

export const SCHEDULE_MUTATION_RECONCILE_DELAY_MS = 2500;

const activeRefetchTimers = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof setTimeout>>
>();

const CANDIDATES_QUERY_KEY = ["people"] as const;
const WINDOW_HISTORY_QUERY_KEY = ["people-plan-window-history"] as const;
const CANDIDATE_DETAILS_QUERY_KEY = ["people-candidate-details"] as const;

interface ScheduleMutationSnapshot {
  candidates: [QueryKey, PositionCandidates | undefined][];
  windowHistory: [QueryKey, PlanWindowHistoryBatch[] | undefined][];
  teamPositions: [QueryKey, TeamPositionGroup[] | undefined][];
}

const snapshotScheduleCaches = (
  queryClient: QueryClient
): ScheduleMutationSnapshot => ({
  candidates: queryClient.getQueriesData<PositionCandidates>({
    queryKey: CANDIDATES_QUERY_KEY,
  }),
  windowHistory: queryClient.getQueriesData<PlanWindowHistoryBatch[]>({
    queryKey: WINDOW_HISTORY_QUERY_KEY,
  }),
  teamPositions: queryClient.getQueriesData<TeamPositionGroup[]>({
    queryKey: ["team-positions"],
  }),
});

export const restoreScheduleCaches = (
  queryClient: QueryClient,
  snapshot: ScheduleMutationSnapshot | undefined
) => {
  if (!snapshot) {
    return;
  }
  for (const [queryKey, data] of snapshot.candidates) {
    queryClient.setQueryData(queryKey, data);
  }
  for (const [queryKey, data] of snapshot.windowHistory) {
    queryClient.setQueryData(queryKey, data);
  }
  for (const [queryKey, data] of snapshot.teamPositions) {
    queryClient.setQueryData(queryKey, data);
  }
};

interface ScheduleMutationQueryFilters extends InvalidateQueryFilters {
  queryKey: QueryKey;
  /**
   * Refetch cached copies nobody is viewing right away. Off for plan-window histories: each
   * costs up to 40 Planning Center requests, so only the one on screen is refetched.
   */
  refetchInactive: boolean;
}

/** Candidate details that carry schedule history; blockouts do not change on schedule writes. */
const hasScheduleHistory = ({ queryKey }: { queryKey: QueryKey }) =>
  queryKey[2] !== null;

const getScheduleMutationQueryFilters = (
  context: ScheduleMutationInvalidateContext
): ScheduleMutationQueryFilters[] => {
  const serviceTypeId = context.serviceTypeId ?? null;
  const planId = context.planId ?? null;
  const teamId = context.teamId ?? null;
  const positionId = context.positionId ?? null;

  return [
    {
      queryKey: ["my-scheduled-plans"],
      refetchInactive: true,
    },
    {
      queryKey:
        isNonEmptyString(serviceTypeId) && planId !== null && planId !== ""
          ? ["team-positions", serviceTypeId, planId]
          : ["team-positions"],
      refetchInactive: true,
    },
    {
      queryKey:
        isNonEmptyString(serviceTypeId) &&
        teamId !== null &&
        teamId !== "" &&
        positionId !== null &&
        positionId !== "" &&
        planId !== null &&
        planId !== ""
          ? queryKeys.positionCandidates(
              serviceTypeId,
              teamId,
              positionId,
              planId
            )
          : CANDIDATES_QUERY_KEY,
      refetchInactive: true,
    },
    { queryKey: WINDOW_HISTORY_QUERY_KEY, refetchInactive: false },
    {
      queryKey: CANDIDATE_DETAILS_QUERY_KEY,
      predicate: hasScheduleHistory,
      refetchInactive: false,
    },
  ];
};

const toQueryFilters = ({
  refetchInactive: _refetchInactive,
  ...filters
}: ScheduleMutationQueryFilters): InvalidateQueryFilters & {
  queryKey: QueryKey;
} => filters;

export const invalidateScheduleMutationQueries = (
  queryClient: QueryClient,
  context: ScheduleMutationInvalidateContext
) => {
  for (const filters of getScheduleMutationQueryFilters(context)) {
    void queryClient.invalidateQueries(toQueryFilters(filters));
  }
};

export const cancelScheduleMutationQueries = async (
  queryClient: QueryClient,
  context: ScheduleMutationInvalidateContext
) =>
  await Promise.all(
    getScheduleMutationQueryFilters(context).map(async (filters) => {
      await queryClient.cancelQueries(toQueryFilters(filters));
    })
  );

const scheduleActiveRefetch = (
  queryClient: QueryClient,
  filters: InvalidateQueryFilters & { queryKey: QueryKey }
) => {
  let clientTimers = activeRefetchTimers.get(queryClient);
  if (!clientTimers) {
    clientTimers = new Map();
    activeRefetchTimers.set(queryClient, clientTimers);
  }

  const timerKey = JSON.stringify(filters.queryKey);
  const currentTimer = clientTimers.get(timerKey);
  if (currentTimer) {
    clearTimeout(currentTimer);
  }

  const nextTimer = setTimeout(() => {
    clientTimers.delete(timerKey);
    void queryClient.refetchQueries({ ...filters, type: "active" });
  }, SCHEDULE_MUTATION_RECONCILE_DELAY_MS);
  clientTimers.set(timerKey, nextTimer);
};

export const settleScheduleMutationQueries = (
  queryClient: QueryClient,
  context: ScheduleMutationInvalidateContext
) => {
  clearCachedMyScheduledPlans();
  clearCachedCandidateSchedules();
  clearCachedPeopleDashboards();
  clearCachedTeamPositions();
  const filtersList = getScheduleMutationQueryFilters(context);

  for (const filters of filtersList) {
    void queryClient.invalidateQueries({
      ...toQueryFilters(filters),
      refetchType: filters.refetchInactive ? "inactive" : "none",
    });
  }

  for (const filters of filtersList) {
    scheduleActiveRefetch(queryClient, toQueryFilters(filters));
  }
};

const statusToFilledStatus = (
  status: OptimisticPlanPersonStatusCode
): FilledPositionPerson["status"] | null => {
  if (status === "D") {
    return null;
  }
  return status === "C" ? "confirmed" : "pending";
};

const recalculateFilledCounts = (position: TeamPosition): TeamPosition => {
  const people = position.filledPeople ?? [];
  return {
    ...position,
    filledConfirmedCount: people.filter(
      (person) => person.status === "confirmed"
    ).length,
    filledPendingCount: people.filter((person) => person.status === "pending")
      .length,
    filledPeople: people.length > 0 ? people : undefined,
  };
};

const upsertFilledPerson = (
  position: TeamPosition,
  person: OptimisticSchedulePerson,
  planPersonId: string,
  statusCode: OptimisticPlanPersonStatusCode
): TeamPosition => {
  const status = statusToFilledStatus(statusCode);
  const currentPeople = position.filledPeople ?? [];
  const filteredPeople = currentPeople.filter(
    (filledPerson) =>
      filledPerson.planPersonId !== planPersonId &&
      filledPerson.id !== person.id
  );

  if (!status) {
    return recalculateFilledCounts({
      ...position,
      filledPeople: filteredPeople,
    });
  }

  const nextPerson: FilledPositionPerson = {
    id: person.id,
    planPersonId,
    name: person.fullName,
    status,
    rawStatus: statusCode,
    photoThumbnailUrl: person.photoThumbnailUrl ?? null,
  };

  const filledPeople = [...filteredPeople, nextPerson].toSorted((a, b) => {
    if (a.status !== b.status) {
      return a.status === "confirmed" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return recalculateFilledCounts({ ...position, filledPeople });
};

const removeFilledPerson = (
  position: TeamPosition,
  planPersonId: string
): TeamPosition => {
  const filledPeople = (position.filledPeople ?? []).filter(
    (person) => person.planPersonId !== planPersonId
  );
  return recalculateFilledCounts({ ...position, filledPeople });
};

const updateFilledPersonStatus = (
  position: TeamPosition,
  planPersonId: string,
  statusCode: OptimisticPlanPersonStatusCode
): TeamPosition => {
  const status = statusToFilledStatus(statusCode);
  const currentPeople = position.filledPeople ?? [];
  const existingPerson = currentPeople.find(
    (person) => person.planPersonId === planPersonId
  );
  if (!existingPerson) {
    return position;
  }

  if (!status) {
    return removeFilledPerson(position, planPersonId);
  }

  const filledPeople = currentPeople
    .map((person) =>
      person.planPersonId === planPersonId
        ? { ...person, status, rawStatus: statusCode }
        : person
    )
    .toSorted((a, b) => {
      if (a.status !== b.status) {
        return a.status === "confirmed" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

  return recalculateFilledCounts({ ...position, filledPeople });
};

const SLOT_STATUS_BY_CODE: Record<
  OptimisticPlanPersonStatusCode,
  SelectedPlanSlot["status"]
> = {
  C: "confirmed",
  U: "pending",
  D: "declined",
};

const slotWithStatus = (
  statusCode: OptimisticPlanPersonStatusCode,
  planPersonId: string
): SelectedPlanSlot => ({
  planPersonId,
  status: SLOT_STATUS_BY_CODE[statusCode],
  declineReason: null,
});

const createOptimisticCandidate = (
  person: OptimisticSchedulePerson,
  planPersonId: string
): PositionCandidate => {
  const [firstFallback = "", ...lastParts] = person.fullName
    .trim()
    .split(/\s+/u);
  return {
    id: person.id,
    firstName: person.firstName ?? firstFallback,
    lastName: person.lastName ?? lastParts.join(" "),
    fullName: person.fullName,
    photoUrl: person.photoUrl ?? null,
    photoThumbnailUrl: person.photoThumbnailUrl ?? null,
    archived: false,
    selectedPlanRosterLabels: [],
    selectedPlanSlot: slotWithStatus("U", planPersonId),
  };
};

const updateCandidates = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  update: (candidate: PositionCandidate) => PositionCandidate
) => {
  queryClient.setQueriesData<PositionCandidates>({ queryKey }, (data) =>
    data === undefined
      ? data
      : { ...data, candidates: data.candidates.map(update) }
  );
};

type WindowRosterRow = PlanWindowHistoryBatch["people"][number]["rows"][number];

/**
 * History's copy of the selected plan can still name a plan person the scheduler just changed;
 * without a roster entry for the slot, the list would fall back to that copy.
 */
const updateWindowRosterRows = (
  queryClient: QueryClient,
  planPersonId: string,
  update: (row: WindowRosterRow) => WindowRosterRow | null
) => {
  queryClient.setQueriesData<PlanWindowHistoryBatch[]>(
    { queryKey: WINDOW_HISTORY_QUERY_KEY },
    (calls) =>
      calls?.map((call) => ({
        ...call,
        people: call.people.map((person) => ({
          ...person,
          rows: person.rows.flatMap((row) => {
            if (row.id !== planPersonId) {
              return [row];
            }
            const next = update(row);
            return next === null ? [] : [next];
          }),
        })),
      }))
  );
};

export const optimisticallySchedulePerson = (
  queryClient: QueryClient,
  slot: OptimisticScheduleSlot,
  person: OptimisticSchedulePerson,
  planPersonId: string
): ScheduleMutationSnapshot => {
  const snapshot = snapshotScheduleCaches(queryClient);

  queryClient.setQueriesData<PositionCandidates>(
    {
      queryKey: queryKeys.positionCandidates(
        slot.serviceTypeId,
        slot.teamId,
        slot.positionId,
        slot.planId
      ),
    },
    (data) => {
      if (!data) {
        return data;
      }
      const found = data.candidates.some(({ id }) => id === person.id);
      // A new person joins at the end so earlier detail batches keep their keys.
      return {
        ...data,
        candidates: found
          ? data.candidates.map((candidate) =>
              candidate.id === person.id
                ? {
                    ...candidate,
                    selectedPlanSlot: slotWithStatus("U", planPersonId),
                  }
                : candidate
            )
          : [
              ...data.candidates,
              createOptimisticCandidate(person, planPersonId),
            ],
      };
    }
  );

  queryClient.setQueriesData<TeamPositionGroup[]>(
    { queryKey: ["team-positions", slot.serviceTypeId, slot.planId] },
    (groups) =>
      groups?.map((group) =>
        group.teamId === slot.teamId
          ? {
              ...group,
              positions: group.positions.map((position) =>
                position.id === slot.positionId
                  ? upsertFilledPerson(position, person, planPersonId, "U")
                  : position
              ),
            }
          : group
      )
  );

  return snapshot;
};

export const reconcileOptimisticPlanPersonId = (
  queryClient: QueryClient,
  optimisticPlanPersonId: string,
  planPersonId: string
) => {
  if (optimisticPlanPersonId === planPersonId) {
    return;
  }

  updateCandidates(queryClient, CANDIDATES_QUERY_KEY, (candidate) =>
    candidate.selectedPlanSlot?.planPersonId === optimisticPlanPersonId
      ? {
          ...candidate,
          selectedPlanSlot: { ...candidate.selectedPlanSlot, planPersonId },
        }
      : candidate
  );

  queryClient.setQueriesData<TeamPositionGroup[]>(
    { queryKey: ["team-positions"] },
    (groups) =>
      groups?.map((group) => ({
        ...group,
        positions: group.positions.map((position) => ({
          ...position,
          filledPeople: position.filledPeople?.map((person) =>
            person.planPersonId === optimisticPlanPersonId
              ? { ...person, planPersonId }
              : person
          ),
        })),
      }))
  );
};

export const optimisticallyUpdatePlanPersonStatus = (
  queryClient: QueryClient,
  planPersonId: string,
  statusCode: OptimisticPlanPersonStatusCode
): ScheduleMutationSnapshot => {
  const snapshot = snapshotScheduleCaches(queryClient);

  updateCandidates(queryClient, CANDIDATES_QUERY_KEY, (candidate) =>
    candidate.selectedPlanSlot?.planPersonId === planPersonId
      ? {
          ...candidate,
          selectedPlanSlot: slotWithStatus(statusCode, planPersonId),
        }
      : candidate
  );
  updateWindowRosterRows(queryClient, planPersonId, (row) => ({
    ...row,
    status: statusCode,
    declineReason: null,
  }));

  queryClient.setQueriesData<TeamPositionGroup[]>(
    { queryKey: ["team-positions"] },
    (groups) =>
      groups?.map((group) => ({
        ...group,
        positions: group.positions.map((position) =>
          updateFilledPersonStatus(position, planPersonId, statusCode)
        ),
      }))
  );

  return snapshot;
};

export const optimisticallyUnschedulePlanPerson = (
  queryClient: QueryClient,
  planPersonId: string,
  personId?: string | null
): ScheduleMutationSnapshot => {
  const snapshot = snapshotScheduleCaches(queryClient);

  updateCandidates(queryClient, CANDIDATES_QUERY_KEY, (candidate) =>
    candidate.selectedPlanSlot?.planPersonId === planPersonId ||
    (isNonEmptyString(personId) && candidate.id === personId)
      ? { ...candidate, selectedPlanSlot: null }
      : candidate
  );
  updateWindowRosterRows(queryClient, planPersonId, () => null);

  queryClient.setQueriesData<TeamPositionGroup[]>(
    { queryKey: ["team-positions"] },
    (groups) =>
      groups?.map((group) => ({
        ...group,
        positions: group.positions.map((position) =>
          removeFilledPerson(position, planPersonId)
        ),
      }))
  );

  return snapshot;
};
