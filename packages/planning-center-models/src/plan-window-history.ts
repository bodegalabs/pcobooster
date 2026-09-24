import { isDeclinedAssignmentStatus } from "@pcobooster/planning-center-models/candidate-frequency";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type {
  CandidateHistory,
  SelectedPlanAssignment,
} from "@pcobooster/planning-center-models/position-candidates";
import type { ServiceHistoryItem } from "@pcobooster/planning-center-models/types";

/**
 * Plan-window history travels as roster rows plus the plans and plan times they point at; a
 * person's history items are expanded from them in the browser. Expanding on the server would
 * repeat each plan's title, service type, and times on every item (about 4 times the bytes).
 */

export interface WindowPlanSummary {
  id: string;
  title: string | null;
  sortDate: string | null;
  serviceTypeName: string | null;
}

export interface WindowPlanTime {
  id: string;
  startsAt: string | null;
  timeType: string | null;
}

/** One plan person on a window roster. */
export interface WindowRosterRow {
  id: string;
  planId: string | null;
  teamId: string | null;
  teamPositionName: string;
  status: string;
  createdAt: string;
  /** Every time the person is assigned to. */
  timeIds: string[];
  /** The service times among them. */
  serviceTimeIds: string[];
  /** Trimmed `decline_reason`, or null when empty. */
  declineReason: string | null;
}

export interface WindowRosterPerson {
  personId: string;
  rows: WindowRosterRow[];
}

/** One call's share of the window; calls are expanded together, in call order. */
export interface PlanWindowRosters {
  plans: WindowPlanSummary[];
  planTimes: WindowPlanTime[];
  people: WindowRosterPerson[];
}

type HistoryTimeType = "service" | "rehearsal" | "other";

const splitPlanPositionName = (teamPositionName: string) => {
  const parts = teamPositionName.split(" - ");
  return parts.length > 1
    ? { teamName: parts[0], positionName: parts.slice(1).join(" - ") }
    : { teamName: undefined, positionName: parts[0] };
};

/** Assigned times that are not service times count as rehearsals unless typed otherwise. */
const inferAssignedTimeType = (rawType: string | null): HistoryTimeType => {
  if (rawType === "other" || rawType === "service") {
    return rawType;
  }
  return "rehearsal";
};

/**
 * History items for one roster row: one per assigned service or rehearsal time, or a single
 * service item on the plan date when the row has no usable times. Declined rows have none.
 */
const rowToServiceHistory = (
  row: WindowRosterRow,
  plan: WindowPlanSummary | undefined,
  planTimeById: ReadonlyMap<string, WindowPlanTime>
): ServiceHistoryItem[] => {
  if (isDeclinedAssignmentStatus(row.status)) {
    return [];
  }
  const fallbackDate = isNonEmptyString(plan?.sortDate)
    ? new Date(plan.sortDate)
    : new Date(row.createdAt);
  const { teamName, positionName } = splitPlanPositionName(
    row.teamPositionName
  );
  const buildItem = (
    id: string,
    date: Date,
    timeType: HistoryTimeType | undefined
  ): ServiceHistoryItem => ({
    id,
    sourceScheduleId: row.id,
    date,
    teamPositionName: positionName || "",
    teamName,
    serviceTypeName: plan?.serviceTypeName ?? undefined,
    planTitle: plan?.title ?? undefined,
    status: row.status || "",
    timeType,
  });
  const dateOf = (planTime: WindowPlanTime | undefined) =>
    isNonEmptyString(planTime?.startsAt)
      ? new Date(planTime.startsAt)
      : fallbackDate;

  const timeIds = new Set(row.timeIds);
  const serviceTimeIds = new Set(row.serviceTimeIds);
  if (timeIds.size === 0 && serviceTimeIds.size === 0) {
    return [buildItem(row.id, fallbackDate, "service")];
  }
  const serviceRows = [...serviceTimeIds].map((planTimeId) =>
    buildItem(
      `${row.id}:${planTimeId}`,
      dateOf(planTimeById.get(planTimeId)),
      "service"
    )
  );
  const rehearsalRows = [...timeIds].flatMap((planTimeId) => {
    if (serviceTimeIds.has(planTimeId)) {
      return [];
    }
    const planTime = planTimeById.get(planTimeId);
    return [
      buildItem(
        `${row.id}:${planTimeId}`,
        dateOf(planTime),
        inferAssignedTimeType(planTime?.timeType ?? null)
      ),
    ];
  });
  const items = [...serviceRows, ...rehearsalRows].filter(
    (item) => item.timeType === "service" || item.timeType === "rehearsal"
  );
  return items.length > 0
    ? items
    : [buildItem(row.id, fallbackDate, "service")];
};

const toSelectedPlanAssignment = (
  row: WindowRosterRow
): SelectedPlanAssignment => ({
  source: "planPerson",
  id: row.id,
  planId: row.planId,
  teamId: row.teamId,
  teamName: null,
  teamPositionName: row.teamPositionName,
  status: row.status,
  planPersonId: null,
  declineReason: row.declineReason,
});

/**
 * Every person's history from the window's calls, in window order: the rows each call returned,
 * with the selected plan's rows kept for slot matching.
 */
export const expandPlanWindowHistory = (
  calls: readonly PlanWindowRosters[],
  selectedPlanId: string
): Map<string, CandidateHistory> => {
  const planById = new Map<string, WindowPlanSummary>();
  const planTimeById = new Map<string, WindowPlanTime>();
  const rowsByPersonId = new Map<string, WindowRosterRow[]>();
  for (const call of calls) {
    for (const plan of call.plans) {
      if (!planById.has(plan.id)) {
        planById.set(plan.id, plan);
      }
    }
    for (const planTime of call.planTimes) {
      planTimeById.set(planTime.id, planTime);
    }
    for (const { personId, rows } of call.people) {
      const personRows = rowsByPersonId.get(personId) ?? [];
      personRows.push(...rows);
      rowsByPersonId.set(personId, personRows);
    }
  }

  const history = new Map<string, CandidateHistory>();
  for (const [personId, rows] of rowsByPersonId) {
    history.set(personId, {
      serviceHistory: rows.flatMap((row) =>
        rowToServiceHistory(
          row,
          isNonEmptyString(row.planId) ? planById.get(row.planId) : undefined,
          planTimeById
        )
      ),
      selectedPlanAssignments: rows.flatMap((row) =>
        row.planId === selectedPlanId ? [toSelectedPlanAssignment(row)] : []
      ),
    });
  }
  return history;
};
