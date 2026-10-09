import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { useFeatures } from "../../app-shell/features";
import { failureMessage, useProductClient } from "../../app-shell/queries";
import {
  useVisibleQuery,
  useReadVisibility,
} from "../../app-shell/visible-queries";
import { useClock, useOrgTimeZone } from "../../lib/environment";
import {
  cachedDashboard,
  describePerson,
  placeholderDetail,
} from "./person-detail";
import { cachedActivities, peopleKeys, peopleReads } from "./reads";
import { computeMemberPaces, personSignals } from "./team-health";
import type { PersonDetail, Roster } from "./types";

/**
 * One person's month (`people.dashboardPerson`) and upcoming blockouts (`people.blockouts`), the
 * native counterpart of the web's `usePeopleDashboardPerson` plus the blockouts the web shows
 * only while ranking candidates.
 *
 * - The first frame paints from what the People list already loaded for them, so opening a
 *   known person never flashes a skeleton.
 * - Paging months keeps the month on screen (dimmed) until the next one answers; each month is
 *   its own query, so a late answer for a month the person has left never replaces this one.
 * - Teams and team pace come from the list, so the page shows the same teams and judges the
 *   same heavy load.
 * - Reads run only while the screen is visible, and only with the `people` flag on.
 */
export const usePersonDetail = (
  personId: string,
  initialMonth: string | null
) => {
  const context = useProductClient();
  const cache = useQueryClient();
  const isFocused = useReadVisibility();
  const features = useFeatures();
  const timeZone = useOrgTimeZone();
  const now = useClock().now();
  const todayKey = formatCalendarDayInTimeZone(now, timeZone);
  const [month, setMonth] = useState(initialMonth);
  const enabled = features.people;

  const dashboard = useMemo(
    () =>
      cachedDashboard(
        cache.getQueryData<Roster>(peopleKeys.roster(context.scope)),
        cachedActivities(cache, context.scope)
      ),
    [cache, context.scope]
  );

  const detailQuery = useVisibleQuery({
    ...peopleReads.person(context, personId, month),
    enabled,
    subscribed: isFocused,
    placeholderData: (previous: PersonDetail | undefined) =>
      placeholderDetail(dashboard, personId, month) ??
      (previous?.person.id === personId
        ? keepPreviousData(previous)
        : undefined) ??
      placeholderDetail(dashboard, personId, null),
  });
  const blockoutsQuery = useVisibleQuery({
    ...peopleReads.blockouts(context, personId),
    enabled,
    subscribed: isFocused,
  });

  const detail = detailQuery.data;
  const rosterPerson =
    dashboard?.scopeRows.find((row) => row.person.id === personId)?.person ??
    null;
  const teamPace = useMemo(
    () =>
      dashboard === undefined
        ? null
        : (computeMemberPaces(dashboard.members, dashboard.teams).get(
            personId
          ) ?? null),
    [dashboard, personId]
  );
  const teams = rosterPerson?.teams ?? detail?.person.teams ?? [];

  const refresh = useCallback(async () => {
    await Promise.all([detailQuery.refetch(), blockoutsQuery.refetch()]);
  }, [blockoutsQuery, detailQuery]);

  return {
    isFeatureOff: !features.isPending && !features.people,
    month,
    detail,
    /** A stand-in (the list's copy, or the previous month) shows while this month loads. */
    isShowingPlaceholder: detailQuery.isPlaceholderData,
    /** Planning Center Services has no record of them: they are in People only. */
    isNotInServices: detailQuery.error instanceof NotFound,
    detailErrorMessage:
      detailQuery.error === null ? null : failureMessage(detailQuery.error),
    retryDetail: async () => {
      await detailQuery.refetch();
    },
    name: detail?.person.name ?? rosterPerson?.name ?? null,
    subtitle: describePerson(teams, detail?.person.roles ?? []),
    signals:
      detail === undefined
        ? []
        : personSignals(detail.person.rhythm, todayKey, teamPace),
    todayKey,
    now,
    blockouts: blockoutsQuery.data,
    blockoutsErrorMessage:
      blockoutsQuery.error === null
        ? null
        : failureMessage(blockoutsQuery.error),
    retryBlockouts: async () => {
      await blockoutsQuery.refetch();
    },
    showPreviousMonth: () => {
      if (detail !== undefined) {
        setMonth(detail.previousMonth);
      }
    },
    showNextMonth: () => {
      if (detail !== undefined) {
        setMonth(detail.nextMonth);
      }
    },
    refresh,
  };
};

export type PersonDetailModel = ReturnType<typeof usePersonDetail>;
