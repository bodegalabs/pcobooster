import type {
  PlanWindowHistoryBatch,
  PositionCandidates,
} from "@pcobooster/contracts/people-schemas";
import type { PositionCandidate } from "@pcobooster/planning-center-models/position-candidates";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
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
import {
  readCachedCandidateAvailability,
  readCachedPositionCandidates,
  writeCachedCandidateAvailability,
  writeCachedPositionCandidates,
} from "@/lib/position-candidates-cache";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedTeamPositions,
  writeCachedTeamPositions,
} from "@/lib/team-positions-cache";

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const person = (
  overrides: Partial<PositionCandidate> = {}
): PositionCandidate => ({
  id: "person-1",
  firstName: "Andrew",
  lastName: "Hinea",
  fullName: "Andrew Hinea",
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  selectedPlanRosterLabels: [],
  selectedPlanSlot: null,
  ...overrides,
});

const candidates = (people: PositionCandidate[]): PositionCandidates => ({
  generatedAt: "2026-05-20T00:00:00.000Z",
  timeZone: "America/Los_Angeles",
  match: { planId: "plan-1", teamId: "team-1" },
  candidates: people,
});

const peopleKey = queryKeys.positionCandidates(
  "service-type-1",
  "team-1",
  "position-1",
  "plan-1"
);

const firstCandidate = (queryClient: QueryClient) =>
  queryClient.getQueryData<PositionCandidates>(peopleKey)?.candidates[0];

const windowRow = (id: string, planId: string) => ({
  id,
  planId,
  teamId: "team-1",
  teamPositionName: "Acoustic Guitar",
  status: "C",
  createdAt: "2026-05-01T00:00:00.000Z",
  timeIds: [],
  serviceTimeIds: [],
  declineReason: null,
});

const windowHistory = (): PlanWindowHistoryBatch[] => [
  {
    generatedAt: "2026-05-20T00:00:00.000Z",
    loadedPlanCount: 2,
    plans: [],
    planTimes: [],
    people: [
      {
        personId: "person-1",
        rows: [
          windowRow("plan-person-earlier", "plan-0"),
          windowRow("plan-person-1", "plan-1"),
        ],
      },
    ],
    deferredPlans: [],
    deferredServiceTypeIds: [],
    requestBudget: {
      limit: 40,
      planningCenterRequests: 3,
      planRangeRequests: 1,
      rosterRequests: 2,
    },
  },
];

const teamGroups = (): TeamPositionGroup[] => [
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

const installLocalStorageMock = () => {
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
};

describe("schedule cache optimism", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks a scheduled person and slot immediately, then reconciles the real plan person id", () => {
    const queryClient = createQueryClient();
    const teamPositionsKey = queryKeys.teamPositions(
      "service-type-1",
      "plan-1",
      "series-1"
    );
    queryClient.setQueryData(peopleKey, candidates([person()]));
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

    expect(firstCandidate(queryClient)?.selectedPlanSlot).toStrictEqual({
      planPersonId: "optimistic-plan-person",
      status: "pending",
      declineReason: null,
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

    expect(firstCandidate(queryClient)?.selectedPlanSlot).toMatchObject({
      planPersonId: "plan-person-1",
    });
    expect(
      queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
        ?.positions[0]?.filledPeople?.[0]
    ).toMatchObject({ planPersonId: "plan-person-1" });
  });

  it("inserts a one-off scheduled person into the selected people cache immediately", () => {
    const queryClient = createQueryClient();
    const teamPositionsKey = queryKeys.teamPositions(
      "service-type-1",
      "plan-1",
      "series-1"
    );
    queryClient.setQueryData(peopleKey, candidates([person()]));
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

    const cached =
      queryClient.getQueryData<PositionCandidates>(peopleKey)?.candidates;
    // Appended, so the detail batches before it keep their keys.
    expect(cached?.map(({ id }) => id)).toStrictEqual(["person-1", "person-2"]);
    expect(cached?.[1]).toMatchObject({
      id: "person-2",
      firstName: "Samuel",
      lastName: "Stefan",
      fullName: "Samuel Stefan",
      photoThumbnailUrl: "https://example.com/samuel.jpg",
      selectedPlanSlot: {
        planPersonId: "optimistic-plan-person-2",
        status: "pending",
      },
    });
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
    const teamPositionsKey = queryKeys.teamPositions(
      "service-type-1",
      "plan-1",
      "series-1"
    );
    queryClient.setQueryData(
      peopleKey,
      candidates([
        person({
          selectedPlanSlot: {
            planPersonId: "plan-person-1",
            status: "pending",
            declineReason: null,
          },
        }),
      ])
    );
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

    expect({
      slot: firstCandidate(queryClient)?.selectedPlanSlot,
      position:
        queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
          ?.positions[0],
    }).toMatchObject({
      slot: { planPersonId: "plan-person-1", status: "confirmed" },
      position: { filledPendingCount: 0, filledConfirmedCount: 1 },
    });

    optimisticallyUpdatePlanPersonStatus(queryClient, "plan-person-1", "D");

    expect({
      slot: firstCandidate(queryClient)?.selectedPlanSlot,
      position:
        queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
          ?.positions[0],
    }).toMatchObject({
      slot: { planPersonId: "plan-person-1", status: "declined" },
      position: {
        filledPendingCount: 0,
        filledConfirmedCount: 0,
        filledPeople: undefined,
      },
    });

    restoreScheduleCaches(queryClient, snapshot);

    expect({
      slot: firstCandidate(queryClient)?.selectedPlanSlot,
      position:
        queryClient.getQueryData<TeamPositionGroup[]>(teamPositionsKey)?.[0]
          ?.positions[0],
    }).toMatchObject({
      slot: { planPersonId: "plan-person-1", status: "pending" },
      position: { filledPendingCount: 1, filledConfirmedCount: 0 },
    });
  });

  it("clears schedule state when a plan person is unscheduled", () => {
    const historyKey = queryKeys.planWindowHistory("2026-05-24T10:00:00.000Z");
    const queryClient = createQueryClient();
    const teamPositionsKey = queryKeys.teamPositions(
      "service-type-1",
      "plan-1",
      "series-1"
    );
    queryClient.setQueryData(
      peopleKey,
      candidates([
        person({
          selectedPlanSlot: {
            planPersonId: "plan-person-1",
            status: "confirmed",
            declineReason: null,
          },
        }),
      ])
    );
    queryClient.setQueryData(historyKey, windowHistory());
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

    expect({
      slot: firstCandidate(queryClient)?.selectedPlanSlot,
      windowRows: queryClient
        .getQueryData<PlanWindowHistoryBatch[]>(historyKey)?.[0]
        ?.people[0]?.rows.map(({ id }) => id),
    }).toStrictEqual({
      slot: null,
      // History's copy of the plan must not put the person back on the slot.
      windowRows: ["plan-person-earlier"],
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
      .mockResolvedValue();

    await cancelScheduleMutationQueries(queryClient, {
      serviceTypeId: "service-type-1",
      planId: "plan-1",
      teamId: "team-1",
      positionId: "position-1",
    });

    const slotKey = queryKeys.positionCandidates(
      "service-type-1",
      "team-1",
      "position-1",
      "plan-1"
    );
    expect(
      cancelQueries.mock.calls.map(([filters]) => ({
        queryKey: filters?.queryKey,
        filtered: filters?.predicate !== undefined,
      }))
    ).toStrictEqual([
      { queryKey: ["my-scheduled-plans"], filtered: false },
      {
        queryKey: ["team-positions", "service-type-1", "plan-1"],
        filtered: false,
      },
      { queryKey: slotKey, filtered: false },
      { queryKey: ["people-plan-window-history"], filtered: false },
      // Only details that carry schedule history; blockouts are untouched.
      { queryKey: ["people-candidate-details"], filtered: true },
    ]);
  });

  it("settles optimistic mutations without immediately refetching the active view", () => {
    vi.useFakeTimers();
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const refetchQueries = vi
      .spyOn(queryClient, "refetchQueries")
      .mockResolvedValue();

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

    const slotKey = queryKeys.positionCandidates(
      "service-type-1",
      "team-1",
      "position-1",
      "plan-1"
    );
    expect(
      invalidateQueries.mock.calls
        .slice(0, 5)
        .map(([filters]) => [filters?.queryKey, filters?.refetchType])
    ).toStrictEqual([
      [["my-scheduled-plans"], "inactive"],
      [["team-positions", "service-type-1", "plan-1"], "inactive"],
      [slotKey, "inactive"],
      // Window histories cost up to 40 requests; only the one on screen refetches.
      [["people-plan-window-history"], "none"],
      [["people-candidate-details"], "none"],
    ]);
    expect(refetchQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SCHEDULE_MUTATION_RECONCILE_DELAY_MS);

    expect(
      refetchQueries.mock.calls.map(([filters]) => [
        filters?.queryKey,
        filters?.type,
      ])
    ).toStrictEqual([
      [["my-scheduled-plans"], "active"],
      [["team-positions", "service-type-1", "plan-1"], "active"],
      [slotKey, "active"],
      [["people-plan-window-history"], "active"],
      [["people-candidate-details"], "active"],
    ]);
  });

  it("clears persisted schedule snapshots when schedule mutations settle", () => {
    installLocalStorageMock();
    const queryClient = createQueryClient();
    const dateKey = "2026-05-24T10:00:00.000Z";
    writeCachedMyScheduledPlans("plan-1,plan-2", { planIds: ["plan-2"] });
    writeCachedPositionCandidates(
      "service-type-1",
      "team-1",
      "position-1",
      "plan-1",
      candidates([person()])
    );
    writeCachedCandidateAvailability(dateKey, [
      { personId: "person-1", isBlockedForDate: true },
    ]);
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
      readCachedPositionCandidates(
        "service-type-1",
        "team-1",
        "position-1",
        "plan-1"
      )
    ).toBeUndefined();
    // Blockouts do not change when someone is scheduled.
    expect(
      readCachedCandidateAvailability(dateKey, ["person-1"])?.data
    ).toStrictEqual([{ personId: "person-1", isBlockedForDate: true }]);
    expect(
      readCachedTeamPositions("service-type-1", "plan-1", "series-1")
    ).toBeUndefined();
  });
});
