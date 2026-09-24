import { useSyncExternalStore } from "react";

import { initialAssignments, people, teams } from "./fixtures";
import type {
  DemoAssignment,
  DemoPerson,
  DemoPosition,
  DemoTeam,
  SlotStatus,
} from "./fixtures";

// A simplified, illustrative stand-in for the product's recommendation score:
// rested people who haven't served often rank highest.
const RECENT_WINDOW_WEEKS = 8;
const FULL_REST_WEEKS = 4;
const HEAVY_LOAD_SERVICES = 4;
const REST_WEIGHT = 60;
const LOAD_WEIGHT = 40;
const ALSO_ON_PLAN_PENALTY = 25;

export type Assignments = Readonly<Record<string, readonly DemoAssignment[]>>;

export type CandidateState =
  | "available"
  | "confirmed"
  | "pending"
  | "blocked"
  | "declined";

export interface Candidate {
  readonly person: DemoPerson;
  readonly state: CandidateState;
  readonly score: number | null;
  readonly reasons: readonly string[];
  readonly alsoOnPlan: readonly string[];
}

const peopleById = new Map(people.map((entry) => [entry.id, entry]));
const positionsById = new Map(
  teams.flatMap((team) =>
    team.positions.map((position) => [position.id, { position, team }] as const)
  )
);

export const findPerson = (personId: string): DemoPerson | undefined =>
  peopleById.get(personId);

export const findPosition = (
  positionId: string
): { position: DemoPosition; team: DemoTeam } | undefined =>
  positionsById.get(positionId);

export const fullName = (entry: DemoPerson): string =>
  `${entry.firstName} ${entry.lastName}`;

export const initials = (entry: DemoPerson): string =>
  `${entry.firstName[0] ?? ""}${entry.lastName[0] ?? ""}`;

export const weeksAgoLabel = (weeksAgo: number): string => {
  if (weeksAgo === 1) {
    return "Last week";
  }
  return `${weeksAgo} weeks ago`;
};

const lastServedWeeksAgo = (entry: DemoPerson): number | null => {
  const services = entry.served.filter((item) => item.rehearsal !== true);
  if (services.length === 0) {
    return null;
  }
  return Math.min(...services.map((item) => item.weeksAgo));
};

const recentServiceCount = (entry: DemoPerson): number => {
  const recentWeeks = new Set<number>();
  for (const item of entry.served) {
    if (item.weeksAgo <= RECENT_WINDOW_WEEKS) {
      recentWeeks.add(item.weeksAgo);
    }
  }
  return recentWeeks.size;
};

const scoreFor = (entry: DemoPerson, alsoOnPlan: boolean): number => {
  const last = lastServedWeeksAgo(entry);
  const rest =
    last === null ? 1 : Math.min(last - 1, FULL_REST_WEEKS) / FULL_REST_WEEKS;
  const load = Math.max(0, 1 - recentServiceCount(entry) / HEAVY_LOAD_SERVICES);
  const score = Math.round(REST_WEIGHT * rest + LOAD_WEIGHT * load);
  return alsoOnPlan ? Math.max(0, score - ALSO_ON_PLAN_PENALTY) : score;
};

const reasonsFor = (
  entry: DemoPerson,
  alsoOnPlan: readonly string[]
): string[] => {
  const last = lastServedWeeksAgo(entry);
  const recent = recentServiceCount(entry);
  const reasons = [
    last === null
      ? "No serving in the last few months"
      : `Last served ${weeksAgoLabel(last).toLowerCase()}`,
    `Served ${recent} of the last ${RECENT_WINDOW_WEEKS} weeks`,
  ];
  if (alsoOnPlan.length > 0) {
    reasons.push(`Already on this plan for ${alsoOnPlan.join(", ")}`);
  }
  return reasons;
};

const assignedPositionNames = (
  assignments: Assignments,
  personId: string,
  exceptPositionId: string
): string[] =>
  Object.entries(assignments).flatMap(([positionId, slots]) => {
    const name = findPosition(positionId)?.position.name;
    const isElsewhere =
      positionId !== exceptPositionId &&
      slots.some((slot) => slot.personId === personId);
    return isElsewhere && name !== undefined ? [name] : [];
  });

const stateFor = (
  entry: DemoPerson,
  positionId: string,
  assignment: DemoAssignment | undefined
): CandidateState => {
  if (assignment !== undefined) {
    return assignment.status;
  }
  if (entry.blockedOut === true) {
    return "blocked";
  }
  if (entry.declined !== undefined && entry.positionIds[0] === positionId) {
    return "declined";
  }
  return "available";
};

const stateRank: Record<CandidateState, number> = {
  confirmed: 0,
  pending: 1,
  available: 2,
  declined: 3,
  blocked: 4,
};

export const candidatesFor = (
  positionId: string,
  assignments: Assignments
): Candidate[] => {
  const slots = assignments[positionId] ?? [];
  return people
    .flatMap((entry) => {
      if (!entry.positionIds.includes(positionId)) {
        return [];
      }
      const state = stateFor(
        entry,
        positionId,
        slots.find((slot) => slot.personId === entry.id)
      );
      const alsoOnPlan = assignedPositionNames(
        assignments,
        entry.id,
        positionId
      );
      return [
        {
          person: entry,
          state,
          score:
            state === "blocked" ? null : scoreFor(entry, alsoOnPlan.length > 0),
          reasons: reasonsFor(entry, alsoOnPlan),
          alsoOnPlan,
        },
      ];
    })
    .toSorted(
      (a, b) =>
        stateRank[a.state] - stateRank[b.state] ||
        (b.score ?? -1) - (a.score ?? -1)
    );
};

export interface SlotSummary {
  readonly filled: number;
  readonly open: number;
  readonly pending: number;
}

export const slotSummary = (
  position: DemoPosition,
  assignments: Assignments
): SlotSummary => {
  const slots = assignments[position.id] ?? [];
  return {
    filled: slots.length,
    open: Math.max(0, position.slots - slots.length),
    pending: slots.filter((slot) => slot.status === "pending").length,
  };
};

export const teamOpenCount = (team: DemoTeam, assignments: Assignments) =>
  team.positions.reduce(
    (total, position) => total + slotSummary(position, assignments).open,
    0
  );

const createStore = <T>(initial: T) => {
  let value: T = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    use: () =>
      useSyncExternalStore(
        subscribe,
        () => value,
        () => initial
      ),
  };
};

// Module-level stores so every replica on the page (hero, lineup, history)
// reflects the same visitor edits, the way the real app shares its cache.
const assignmentStore = createStore<Assignments>(initialAssignments);

export const useAssignments = (): Assignments => assignmentStore.use();

export const addAssignment = (positionId: string, personId: string) => {
  const current = assignmentStore.get();
  const slots = current[positionId] ?? [];
  if (slots.some((slot) => slot.personId === personId)) {
    return;
  }
  assignmentStore.set({
    ...current,
    [positionId]: [...slots, { personId, status: "pending" }],
  });
};

export const setAssignmentStatus = (
  positionId: string,
  personId: string,
  status: SlotStatus
) => {
  const current = assignmentStore.get();
  assignmentStore.set({
    ...current,
    [positionId]: (current[positionId] ?? []).map((slot) =>
      slot.personId === personId ? { ...slot, status } : slot
    ),
  });
};

export const removeAssignment = (positionId: string, personId: string) => {
  const current = assignmentStore.get();
  assignmentStore.set({
    ...current,
    [positionId]: (current[positionId] ?? []).filter(
      (slot) => slot.personId !== personId
    ),
  });
};

export const resetAssignments = () => {
  assignmentStore.set(initialAssignments);
};

export type DemoView = "assign" | "lineup" | "plan";

export interface DemoRoute {
  readonly view: DemoView;
  readonly positionId: string;
}

const routeStore = createStore<DemoRoute>({
  view: "assign",
  positionId: "acoustic",
});

export const useDemoRoute = (): DemoRoute => routeStore.use();

export const navigateDemo = (next: Partial<DemoRoute>) => {
  routeStore.set({ ...routeStore.get(), ...next });
};
