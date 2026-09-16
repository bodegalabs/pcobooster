import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelScheduleMutationQueries,
  optimisticallySchedulePerson,
  optimisticallyUnschedulePlanPerson,
  optimisticallyUpdatePlanPersonStatus,
  reconcileOptimisticPlanPersonId,
  restoreScheduleCaches,
  SCHEDULE_MUTATION_RECONCILE_DELAY_MS,
  settleScheduleMutationQueries,
} from "@/hooks/use-schedule-cache-optimism";
import {
  readCachedMyScheduledPlans,
  writeCachedMyScheduledPlans,
} from "@/lib/my-scheduled-plans-cache";
import { readCachedPeople, writeCachedPeople } from "@/lib/people-cache";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedTeamPositions,
  writeCachedTeamPositions,
} from "@/lib/team-positions-cache";
import type { PersonWithAvailability, TeamPositionGroup } from "@/lib/types";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function person(
  overrides: Partial<PersonWithAvailability> = {}
): PersonWithAvailability {
  return {
    id: "person-1",
    firstName: "Andrew",
    lastName: "Hinea",
    fullName: "Andrew Hinea",
    photoUrl: null,
    photoThumbnailUrl: null,
    archived: false,
    positions: [],
    ...overrides,
  };
}

function teamGroups(): TeamPositionGroup[] {
  return [
    {
      teamId: "team-1",
      teamName: "Band",
      positions: [
        {
          id: "position-1",
          name: "Acoustic Guitar",
          teamId: "team-1",
          teamName: "Band",
          neededCount: 1,
          filledPendingCount: 0,
          filledConfirmedCount: 0,
        },
      ],
    },
  ];
}

function installLocalStorageMock() {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return storage.size;
      },
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => [...storage.keys()][index] ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
}

describe("schedule cache optimism", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks a scheduled person and slot immediately, then reconciles the real plan person id", () => {
    const queryClient = createQueryClient();
    const peopleKey = queryKeys.people(
      "service-type-1",
      "team-1",
      "position-1",
      "plan-1",
      "2026-05-24T10:00:00.000Z"
    );
    const teamPositionsKey = queryKeys.teamPositions(
      "service-type-1",
      "plan-1",
      "series-1"
    );
    queryClient.setQueryData<PersonWithAvailability[]>(peopleKey, [person()]);
    queryClient.setQueryData<TeamPositionGroup[]>(
      teamPositionsKey,
      teamGroups()
    );

    optimisticallySchedulePerson(
      queryClient,
      {
        serviceTypeId: "service-type-1",
        planId: "plan-1",
        teamId: "team-1",
        positionId: "position-1",
      },
      { id: "person-1", fullName: "Andrew Hinea", photoThumbnailUrl: null },
      "optimistic-plan-person"
    );

    expect(
      queryClient.getQueryData<PersonWithAvailability[]>(peopleKey)?.[0]
    ).toMatchObject({
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: false,
      isDeclinedForSelectedPlanPosition: false,
      scheduledPlanPersonId: "optimistic-plan-person",
    });
    expect(
      queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
        ?.positions[0]
    ).toMatchObject({
      filledPendingCount: 1,
      filledConfirmedCount: 0,
      filledPeople: [
        {
          id: "person-1",
          planPersonId: "optimistic-plan-person",
          name: "Andrew Hinea",
          status: "pending",
        },
      ],
    });

    reconcileOptimisticPlanPersonId(
      queryClient,
      "optimistic-plan-person",
      "plan-person-1"
    );

    expect(
      queryClient.getQueryData<PersonWithAvailability[]>(peopleKey)?.[0]
    ).toMatchObject({
      scheduledPlanPersonId: "plan-person-1",
    });
    expect(
      queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
        ?.positions[0]?.filledPeople?.[0]
    ).toMatchObject({ planPersonId: "plan-person-1" });
  });

  it("inserts a one-off scheduled person into the selected people cache immediately", () => {
    const queryClient = createQueryClient();
    const peopleKey = queryKeys.people(
      "service-type-1",
      "team-1",
      "position-1",
      "plan-1",
      "2026-05-24T10:00:00.000Z"
    );
    const teamPositionsKey = queryKeys.teamPositions(
      "service-type-1",
      "plan-1",
      "series-1"
    );
    queryClient.setQueryData<PersonWithAvailability[]>(peopleKey, [person()]);
    queryClient.setQueryData<TeamPositionGroup[]>(
      teamPositionsKey,
      teamGroups()
    );

    optimisticallySchedulePerson(
      queryClient,
      {
        serviceTypeId: "service-type-1",
        planId: "plan-1",
        teamId: "team-1",
        positionId: "position-1",
      },
      {
        id: "person-2",
        firstName: "Samuel",
        lastName: "Stefan",
        fullName: "Samuel Stefan",
        photoThumbnailUrl: "https://example.com/samuel.jpg",
      },
      "optimistic-plan-person-2"
    );

    expect(
      queryClient.getQueryData<PersonWithAvailability[]>(peopleKey)?.[0]
    ).toMatchObject({
      id: "person-2",
      firstName: "Samuel",
      lastName: "Stefan",
      fullName: "Samuel Stefan",
      photoThumbnailUrl: "https://example.com/samuel.jpg",
      isScheduledForSelectedPlanPosition: true,
      scheduledPlanPersonId: "optimistic-plan-person-2",
    });
    expect(
      queryClient.getQueryData<PersonWithAvailability[]>(peopleKey)
    ).toHaveLength(2);
    expect(
      queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
        ?.positions[0]?.filledPeople?.[0]
    ).toMatchObject({
      id: "person-2",
      planPersonId: "optimistic-plan-person-2",
      name: "Samuel Stefan",
      status: "pending",
    });
  });

  it("updates status, removes declined people from filled slot counts, and restores snapshots", () => {
    const queryClient = createQueryClient();
    const peopleKey = queryKeys.people(
      "service-type-1",
      "team-1",
      "position-1",
      "plan-1",
      "2026-05-24T10:00:00.000Z"
    );
    const teamPositionsKey = queryKeys.teamPositions(
      "service-type-1",
      "plan-1",
      "series-1"
    );
    queryClient.setQueryData<PersonWithAvailability[]>(peopleKey, [
      person({
        isScheduledForSelectedPlanPosition: true,
        isConfirmedForSelectedPlanPosition: false,
        isDeclinedForSelectedPlanPosition: false,
        scheduledPlanPersonId: "plan-person-1",
      }),
    ]);
    queryClient.setQueryData<TeamPositionGroup[]>(teamPositionsKey, [
      {
        teamId: "team-1",
        teamName: "Band",
        positions: [
          {
            ...teamGroups()[0].positions[0],
            filledPendingCount: 1,
            filledConfirmedCount: 0,
            filledPeople: [
              {
                id: "person-1",
                planPersonId: "plan-person-1",
                name: "Andrew Hinea",
                status: "pending",
                rawStatus: "U",
                photoThumbnailUrl: null,
              },
            ],
          },
        ],
      },
    ]);

    const snapshot = optimisticallyUpdatePlanPersonStatus(
      queryClient,
      "plan-person-1",
      "C"
    );

    expect(
      queryClient.getQueryData<PersonWithAvailability[]>(peopleKey)?.[0]
    ).toMatchObject({
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: true,
      isDeclinedForSelectedPlanPosition: false,
    });
    expect(
      queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
        ?.positions[0]
    ).toMatchObject({
      filledPendingCount: 0,
      filledConfirmedCount: 1,
    });

    optimisticallyUpdatePlanPersonStatus(queryClient, "plan-person-1", "D");

    expect(
      queryClient.getQueryData<PersonWithAvailability[]>(peopleKey)?.[0]
    ).toMatchObject({
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: false,
      isDeclinedForSelectedPlanPosition: true,
    });
    expect(
      queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
        ?.positions[0]
    ).toMatchObject({
      filledPendingCount: 0,
      filledConfirmedCount: 0,
      filledPeople: undefined,
    });

    restoreScheduleCaches(queryClient, snapshot);

    expect(
      queryClient.getQueryData<PersonWithAvailability[]>(peopleKey)?.[0]
    ).toMatchObject({
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: false,
      scheduledPlanPersonId: "plan-person-1",
    });
    expect(
      queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
        ?.positions[0]
    ).toMatchObject({
      filledPendingCount: 1,
      filledConfirmedCount: 0,
    });
  });

  it("clears schedule state when a plan person is unscheduled", () => {
    const queryClient = createQueryClient();
    const peopleKey = queryKeys.people(
      "service-type-1",
      "team-1",
      "position-1",
      "plan-1",
      "2026-05-24T10:00:00.000Z"
    );
    const teamPositionsKey = queryKeys.teamPositions(
      "service-type-1",
      "plan-1",
      "series-1"
    );
    queryClient.setQueryData<PersonWithAvailability[]>(peopleKey, [
      person({
        isScheduledForSelectedPlanPosition: true,
        isConfirmedForSelectedPlanPosition: true,
        scheduledPlanPersonId: "plan-person-1",
      }),
    ]);
    queryClient.setQueryData<TeamPositionGroup[]>(teamPositionsKey, [
      {
        teamId: "team-1",
        teamName: "Band",
        positions: [
          {
            ...teamGroups()[0].positions[0],
            filledPendingCount: 0,
            filledConfirmedCount: 1,
            filledPeople: [
              {
                id: "person-1",
                planPersonId: "plan-person-1",
                name: "Andrew Hinea",
                status: "confirmed",
                rawStatus: "C",
                photoThumbnailUrl: null,
              },
            ],
          },
        ],
      },
    ]);

    optimisticallyUnschedulePlanPerson(
      queryClient,
      "plan-person-1",
      "person-1"
    );

    expect(
      queryClient.getQueryData<PersonWithAvailability[]>(peopleKey)?.[0]
    ).toMatchObject({
      isScheduledForSelectedPlanPosition: false,
      isConfirmedForSelectedPlanPosition: false,
      isDeclinedForSelectedPlanPosition: false,
      scheduledPlanPersonId: undefined,
    });
    expect(
      queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
        ?.positions[0]
    ).toMatchObject({
      filledPendingCount: 0,
      filledConfirmedCount: 0,
      filledPeople: undefined,
    });
  });

  it("cancels current-user plan membership and affected schedule query families", async () => {
    const queryClient = createQueryClient();
    const cancelQueries = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined);

    await cancelScheduleMutationQueries(queryClient, {
      serviceTypeId: "service-type-1",
      planId: "plan-1",
      teamId: "team-1",
      positionId: "position-1",
    });

    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: ["my-scheduled-plans"],
    });
    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: ["team-positions", "service-type-1", "plan-1"],
    });
    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.peopleForSlot(
        "service-type-1",
        "team-1",
        "position-1",
        "plan-1"
      ),
    });
    expect(cancelQueries).toHaveBeenCalledTimes(3);
  });

  it("settles optimistic mutations without immediately refetching the active view", () => {
    vi.useFakeTimers();
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const refetchQueries = vi
      .spyOn(queryClient, "refetchQueries")
      .mockResolvedValue(undefined);

    settleScheduleMutationQueries(queryClient, {
      serviceTypeId: "service-type-1",
      planId: "plan-1",
      teamId: "team-1",
      positionId: "position-1",
    });
    settleScheduleMutationQueries(queryClient, {
      serviceTypeId: "service-type-1",
      planId: "plan-1",
      teamId: "team-1",
      positionId: "position-1",
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["my-scheduled-plans"],
      refetchType: "inactive",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["team-positions", "service-type-1", "plan-1"],
      refetchType: "inactive",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.peopleForSlot(
        "service-type-1",
        "team-1",
        "position-1",
        "plan-1"
      ),
      refetchType: "inactive",
    });
    expect(refetchQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SCHEDULE_MUTATION_RECONCILE_DELAY_MS);

    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["my-scheduled-plans"],
      type: "active",
    });
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["team-positions", "service-type-1", "plan-1"],
      type: "active",
    });
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.peopleForSlot(
        "service-type-1",
        "team-1",
        "position-1",
        "plan-1"
      ),
      type: "active",
    });
    expect(refetchQueries).toHaveBeenCalledTimes(3);
  });

  it("clears persisted schedule snapshots when schedule mutations settle", () => {
    installLocalStorageMock();
    const queryClient = createQueryClient();
    const dateKey = "2026-05-24T10:00:00.000Z";
    writeCachedMyScheduledPlans("plan-1,plan-2", { planIds: ["plan-2"] });
    writeCachedPeople(
      "service-type-1",
      "team-1",
      "position-1",
      "plan-1",
      dateKey,
      [person()]
    );
    writeCachedTeamPositions(
      "service-type-1",
      "plan-1",
      "series-1",
      teamGroups()
    );

    settleScheduleMutationQueries(queryClient, {
      serviceTypeId: "service-type-1",
      planId: "plan-1",
      teamId: "team-1",
      positionId: "position-1",
    });

    expect(readCachedMyScheduledPlans("plan-1,plan-2")).toBeUndefined();
    expect(
      readCachedPeople(
        "service-type-1",
        "team-1",
        "position-1",
        "plan-1",
        dateKey
      )
    ).toBeUndefined();
    expect(
      readCachedTeamPositions("service-type-1", "plan-1", "series-1")
    ).toBeUndefined();
  });
});
