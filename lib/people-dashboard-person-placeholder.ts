import type {
  PeopleDashboardData,
  PeopleDashboardPersonDetail,
} from "@/lib/use-cases/planning-center/people-dashboard-types";

const formatDashboardMonthKey = (month: PeopleDashboardData["month"]): string =>
  `${month.year}-${String(month.monthIndex + 1).padStart(2, "0")}`;

const shiftMonthKey = (
  year: number,
  monthIndex: number,
  delta: number
): string => {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const getCachedPeopleDashboardPersonDetail = (
  dashboards: (PeopleDashboardData | undefined)[],
  personId: string,
  month: string | null
): PeopleDashboardPersonDetail | undefined => {
  for (const dashboard of dashboards) {
    if (!dashboard) {
      continue;
    }
    const dashboardMonth = formatDashboardMonthKey(dashboard.month);
    if (month !== null && month !== dashboardMonth) {
      continue;
    }

    const person = dashboard.people.find(
      (candidate) => candidate.id === personId
    );
    if (!person) {
      continue;
    }

    return {
      generatedAt: dashboard.generatedAt,
      month: dashboard.month,
      previousMonth: shiftMonthKey(
        dashboard.month.year,
        dashboard.month.monthIndex,
        -1
      ),
      nextMonth: shiftMonthKey(
        dashboard.month.year,
        dashboard.month.monthIndex,
        1
      ),
      person,
      trend: [],
      requestBudget: {
        scheduleRequests: 0,
        blockoutRequests: 0,
      },
    };
  }

  return undefined;
};
