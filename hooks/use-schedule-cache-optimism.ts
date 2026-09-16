"use client";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { isNonEmptyString } from "@/lib/json";
import { clearCachedMyScheduledPlans } from "@/lib/my-scheduled-plans-cache";
import { clearCachedPeople } from "@/lib/people-cache";
import { clearCachedPeopleDashboards } from "@/lib/people-dashboard-cache";
import { queryKeys } from "@/lib/query-keys";
import { clearCachedTeamPositions } from "@/lib/team-positions-cache";
import type {
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPosition,
  TeamPositionGroup,
} from "@/lib/types";

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

interface ScheduleMutationSnapshot {
  people: [QueryKey, PersonWithAvailability[] | undefined][];
  teamPositions: [QueryKey, TeamPositionGroup[] | undefined][];
}

const snapshotScheduleCaches = (
  queryClient: QueryClient
): ScheduleMutationSnapshot => ({
  people: queryClient.getQueriesData<PersonWithAvailability[]>({
    queryKey: ["people"],
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
  for (const [queryKey, data] of snapshot.people) {
    queryClient.setQueryData(queryKey, data);
  }
  for (const [queryKey, data] of snapshot.teamPositions) {
    queryClient.setQueryData(queryKey, data);
  }
};

const getScheduleMutationQueryFilters = (
  context: ScheduleMutationInvalidateContext
) => {
  const serviceTypeId = context.serviceTypeId ?? null;
  const planId = context.planId ?? null;
  const teamId = context.teamId ?? null;
  const positionId = context.positionId ?? null;

  return [
    {
      queryKey: ["my-scheduled-plans"],
    },
    {
      queryKey:
        isNonEmptyString(serviceTypeId) && planId !== null && planId !== ""
          ? ["team-positions", serviceTypeId, planId]
          : ["team-positions"],
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
          ? queryKeys.peopleForSlot(serviceTypeId, teamId, positionId, planId)
          : ["people"],
    },
  ];
};

export const invalidateScheduleMutationQueries = (
  queryClient: QueryClient,
  context: ScheduleMutationInvalidateContext
) => {
  for (const filters of getScheduleMutationQueryFilters(context)) {
    void queryClient.invalidateQueries(filters);
  }
};

export const cancelScheduleMutationQueries = async (
  queryClient: QueryClient,
  context: ScheduleMutationInvalidateContext
) =>
  await Promise.all(
    getScheduleMutationQueryFilters(context).map(async (filters) => {
      await queryClient.cancelQueries(filters);
    })
  );

const scheduleActiveRefetch = (
  queryClient: QueryClient,
  filters: { queryKey: QueryKey }
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
  clearCachedPeople();
  clearCachedPeopleDashboards();
  clearCachedTeamPositions();
  const filtersList = getScheduleMutationQueryFilters(context);

  for (const filters of filtersList) {
    void queryClient.invalidateQueries({ ...filters, refetchType: "inactive" });
  }

  for (const filters of filtersList) {
    scheduleActiveRefetch(queryClient, filters);
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

const applyStatusToPerson = (
  person: PersonWithAvailability,
  statusCode: OptimisticPlanPersonStatusCode,
  planPersonId: string
): PersonWithAvailability => ({
  ...person,
  isScheduledForSelectedPlanPosition: true,
  isConfirmedForSelectedPlanPosition: statusCode === "C",
  isDeclinedForSelectedPlanPosition: statusCode === "D",
  selectedPlanDeclineReason: statusCode === "D" ? null : undefined,
  scheduledPlanPersonId: planPersonId,
});

const createOptimisticPerson = (
  person: OptimisticSchedulePerson,
  planPersonId: string
): PersonWithAvailability => {
  const [firstFallback = "", ...lastParts] = person.fullName
    .trim()
    .split(/\s+/u);
  return applyStatusToPerson(
    {
      id: person.id,
      firstName: person.firstName ?? firstFallback,
      lastName: person.lastName ?? lastParts.join(" "),
      fullName: person.fullName,
      photoUrl: person.photoUrl ?? null,
      photoThumbnailUrl: person.photoThumbnailUrl ?? null,
      archived: false,
      positions: [],
    },
    "U",
    planPersonId
  );
};

const clearStatusFromPerson = (
  person: PersonWithAvailability
): PersonWithAvailability => ({
  ...person,
  isScheduledForSelectedPlanPosition: false,
  isConfirmedForSelectedPlanPosition: false,
  isDeclinedForSelectedPlanPosition: false,
  selectedPlanDeclineReason: undefined,
  scheduledPlanPersonId: undefined,
});

export const optimisticallySchedulePerson = (
  queryClient: QueryClient,
  slot: OptimisticScheduleSlot,
  person: OptimisticSchedulePerson,
  planPersonId: string
): ScheduleMutationSnapshot => {
  const snapshot = snapshotScheduleCaches(queryClient);

  queryClient.setQueriesData<PersonWithAvailability[]>(
    {
      queryKey: queryKeys.peopleForSlot(
        slot.serviceTypeId,
        slot.teamId,
        slot.positionId,
        slot.planId
      ),
    },
    (people) => {
      if (!people) {
        return people;
      }
      let found = false;
      const updatedPeople = people.map((cachedPerson) => {
        if (cachedPerson.id !== person.id) {
          return cachedPerson;
        }
        found = true;
        return applyStatusToPerson(cachedPerson, "U", planPersonId);
      });
      return found
        ? updatedPeople
        : [createOptimisticPerson(person, planPersonId), ...updatedPeople];
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

  queryClient.setQueriesData<PersonWithAvailability[]>(
    { queryKey: ["people"] },
    (people) =>
      people?.map((person) =>
        person.scheduledPlanPersonId === optimisticPlanPersonId
          ? { ...person, scheduledPlanPersonId: planPersonId }
          : person
      )
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

  queryClient.setQueriesData<PersonWithAvailability[]>(
    { queryKey: ["people"] },
    (people) =>
      people?.map((person) =>
        person.scheduledPlanPersonId === planPersonId
          ? applyStatusToPerson(person, statusCode, planPersonId)
          : person
      )
  );

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

  queryClient.setQueriesData<PersonWithAvailability[]>(
    { queryKey: ["people"] },
    (people) =>
      people?.map((person) =>
        person.scheduledPlanPersonId === planPersonId ||
        (isNonEmptyString(personId) && person.id === personId)
          ? clearStatusFromPerson(person)
          : person
      )
  );

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
