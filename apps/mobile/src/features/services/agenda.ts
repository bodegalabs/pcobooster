/**
 * The Services agenda's window, search, and labels (Swift `ServicesHomeModel`), on top of the
 * shared rules in `@pcobooster/planning-center-models/service-plans`.
 */
import {
  formatPlanDate,
  isInDateWindow,
} from "@pcobooster/planning-center-models/service-plans";
import type {
  DateRangeFilter,
  ServicePlanRow,
} from "@pcobooster/planning-center-models/service-plans";

/** Which plans the agenda lists: the web's upcoming windows, plus recent past plans. */
export type ServicesWindow =
  | "next14Days"
  | "next30Days"
  | "next60Days"
  | "allUpcoming"
  | "recent";

/** The web's default window. */
export const DEFAULT_WINDOW: ServicesWindow = "next60Days";

export const upcomingWindows = [
  "next14Days",
  "next30Days",
  "next60Days",
  "allUpcoming",
] as const satisfies readonly ServicesWindow[];

/** The upcoming filter a window applies; null for recent plans. */
export const windowRange: Record<ServicesWindow, DateRangeFilter | null> = {
  next14Days: "14",
  next30Days: "30",
  next60Days: "60",
  allUpcoming: "all",
  recent: null,
};

export const windowTitle: Record<ServicesWindow, string> = {
  next14Days: "Next 14 days",
  next30Days: "Next 30 days",
  next60Days: "Next 60 days",
  allUpcoming: "All upcoming",
  recent: "Recent",
};

/** Combining marks, which `normalize("NFD")` splits from their letters. */
const SEARCH_FOLD = /[\u0300-\u036F]/gu;

/** Case and diacritic insensitive, as `range(of:options:)` matches. */
const fold = (text: string): string =>
  text.normalize("NFD").replace(SEARCH_FOLD, "").toLowerCase();

/** What the search matches a row against, folded. */
const rowSearchText = (row: ServicePlanRow, timeZone: string): string =>
  fold(
    [
      row.serviceTypeName,
      row.planTitle,
      row.seriesTitle ?? "",
      formatPlanDate(row.sortDate, timeZone),
    ].join(" ")
  );

interface VisibleRowsInput {
  readonly upcoming: readonly ServicePlanRow[];
  /** Recent plans in agenda order (oldest first); the window shows them newest first. */
  readonly recent: readonly ServicePlanRow[];
  readonly window: ServicesWindow;
  readonly searchText: string;
  readonly timeZone: string;
  readonly now: Date;
}

/**
 * The agenda after the window and the search (service type, titles, and the plan's date as the
 * list writes it, as the web matches them).
 */
export const visibleRows = ({
  upcoming,
  recent,
  window,
  searchText,
  timeZone,
  now,
}: VisibleRowsInput): ServicePlanRow[] => {
  const range = windowRange[window];
  const rows =
    range === null
      ? recent.filter((row) => row.sortDate < now).toReversed()
      : upcoming.filter((row) =>
          isInDateWindow(row.sortDate, range, timeZone, now)
        );
  const query = fold(searchText.trim());
  if (query === "") {
    return rows;
  }
  const matchesQuery = (row: ServicePlanRow): boolean =>
    rowSearchText(row, timeZone).includes(query);
  return rows.filter(matchesQuery);
};

/** Upcoming plans the signed-in person is on, within the window ("Your services"). */
export const myRows = ({
  upcoming,
  window,
  myPlanIds,
  timeZone,
  now,
}: {
  readonly upcoming: readonly ServicePlanRow[];
  readonly window: ServicesWindow;
  readonly myPlanIds: ReadonlySet<string>;
  readonly timeZone: string;
  readonly now: Date;
}): ServicePlanRow[] => {
  const range = windowRange[window];
  if (range === null) {
    return [];
  }
  return upcoming.filter(
    (row) =>
      myPlanIds.has(row.planId) &&
      isInDateWindow(row.sortDate, range, timeZone, now)
  );
};

const INLINE_NAME_LIMIT = 2;

/** "All service types", one or two names, or "3 service types" (the web's filter label). */
export const serviceTypeSummary = (
  all: readonly { readonly id: string; readonly name: string }[],
  selectedIds: ReadonlySet<string>
): string => {
  const selected = all.filter((serviceType) => selectedIds.has(serviceType.id));
  if (all.length === 0 || selected.length === all.length) {
    return "All service types";
  }
  if (selected.length === 0) {
    return "No service types";
  }
  if (selected.length <= INLINE_NAME_LIMIT) {
    return selected.map((serviceType) => serviceType.name).join(", ");
  }
  return `${selected.length} service types`;
};

/** The agenda's last line, and the next step out of its window. */
export const windowFooter = (
  window: ServicesWindow
): {
  readonly text: string;
  readonly action: { readonly title: string; readonly window: ServicesWindow };
} | null => {
  switch (window) {
    case "next14Days":
    case "next30Days":
    case "next60Days": {
      return {
        text: `Plans in the ${windowTitle[window].toLowerCase()}.`,
        action: { title: "Show all upcoming", window: "allUpcoming" },
      };
    }
    case "allUpcoming": {
      return null;
    }
    case "recent": {
      return {
        text: "The latest past plans of each service type.",
        action: { title: "Show upcoming plans", window: DEFAULT_WINDOW },
      };
    }
    default: {
      return window satisfies never;
    }
  }
};
