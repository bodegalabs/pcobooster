import {
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
  formatWallTimeInTimeZone,
  orgCalendarDaysRefMinusItem,
  zonedWallTimeToUtcIso,
} from "@pcobooster/planning-center-models/calendar";
import { formatTimeOfDay } from "@pcobooster/planning-center-models/plan-overview";
import { buildDefaultNewPlanTimeEdit } from "@pcobooster/planning-center-models/plan-time-edits";
import type { EditablePlanTime } from "@pcobooster/planning-center-models/plan-time-edits";
import type {
  FilledPositionPerson,
  PlanTime,
  PlanTimeType,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

import { isPlaceholderId } from "../placeholder-ids";
import { listFormat } from "../roster";

export const timeKinds: readonly PlanTimeType[] = [
  "rehearsal",
  "service",
  "other",
];
export const kindLabel = (kind: PlanTimeType): string => {
  if (kind === "service") {
    return "Service";
  }
  return kind === "rehearsal" ? "Rehearsal" : "Other";
};
export const timeTitle = (time: PlanTime): string =>
  time.name.trim() === "" ? kindLabel(time.timeType) : time.name.trim();
export const durationLabel = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h${rest > 0 ? ` ${rest}m` : ""}` : `${minutes}m`;
};
export const effectiveEnd = (time: PlanTime): number =>
  Math.max(
    time.startsAt.getTime(),
    time.endsAt?.getTime() ?? time.startsAt.getTime()
  );
/** "Service · 1h 15m" (just the length when the type is the title), or "Adding" until the create lands. */
export const timeKindLine = (time: PlanTime): string => {
  if (isPlaceholderId(time.id)) {
    return "Adding";
  }
  const seconds =
    time.endsAt === null
      ? 0
      : (time.endsAt.getTime() - time.startsAt.getTime()) / 1000;
  const length = seconds > 0 ? durationLabel(seconds) : null;
  if (
    timeTitle(time).toLowerCase() === kindLabel(time.timeType).toLowerCase()
  ) {
    return length ?? "No end time";
  }
  return length === null
    ? kindLabel(time.timeType)
    : `${kindLabel(time.timeType)} · ${length}`;
};
export const endClock = (time: PlanTime, zone: string): string | null => {
  if (time.endsAt === null) {
    return null;
  }
  const clock = formatTimeOfDay(time.endsAt, zone);
  return formatCalendarDayInTimeZone(time.startsAt, zone) ===
    formatCalendarDayInTimeZone(time.endsAt, zone)
    ? clock
    : `${formatCalendarDateLabel(time.endsAt, zone, "weekday")} ${clock}`;
};
/** "Sun, Oct 4 · 8:00 PM - 9:30 PM" in the org zone, with the end's day when it differs. */
export const timeRangeLabel = (time: PlanTime, zone: string): string => {
  const day = formatCalendarDateLabel(time.startsAt, zone, "weekdayMonthDay");
  const start = formatTimeOfDay(time.startsAt, zone);
  if (time.endsAt === null) {
    return `${day} · ${start}`;
  }
  const end = formatTimeOfDay(time.endsAt, zone);
  return formatCalendarDayInTimeZone(time.startsAt, zone) ===
    formatCalendarDayInTimeZone(time.endsAt, zone)
    ? `${day} · ${start} - ${end}`
    : `${day} ${start} - ${formatCalendarDateLabel(time.endsAt, zone, "weekdayMonthDay")} ${end}`;
};
/** Faces and names a time's preview shows before "and N more". */
export const PREVIEW_PEOPLE = 6;
/** "Ana, Ben, and Cy", or the first six and "and 2 more". */
export const previewNames = (names: readonly string[]): string => {
  const shown = names.slice(0, PREVIEW_PEOPLE);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(", ")}, and ${rest} more` : listFormat(shown);
};
export const timeDays = (times: PlanTime[], zone: string, now: Date) => {
  const days = new Map<string, PlanTime[]>();
  for (const time of times.toSorted(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
  )) {
    const key = formatCalendarDayInTimeZone(time.startsAt, zone);
    const values = days.get(key) ?? [];
    values.push(time);
    days.set(key, values);
  }
  return [...days].map(([key, values]) => {
    const [first] = values;
    const delta = orgCalendarDaysRefMinusItem(
      formatCalendarDayInTimeZone(first.startsAt, zone),
      formatCalendarDayInTimeZone(now, zone)
    );
    let relative = delta < 0 ? `In ${-delta} days` : `${delta} days ago`;
    if (delta === 0) {
      relative = "Today";
    }
    if (delta === -1) {
      relative = "Tomorrow";
    }
    if (delta === 1) {
      relative = "Yesterday";
    }
    return {
      key,
      times: values,
      label: formatCalendarDateLabel(first.startsAt, zone, "weekdayMonthDay"),
      relative,
    };
  });
};

const joinNames = (names: string[]): string => {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
};
export const rowAssignments = (
  time: PlanTime,
  groups: TeamPositionGroup[]
): string | null => {
  const parts: string[] = [];
  const teamIds = new Set(time.assignedTeamIds);
  const positionIds = new Set(time.assignedPositionIds);
  if (time.assignedTeamIds.length > 0) {
    const names = groups.flatMap((group) =>
      teamIds.has(group.teamId) ? [group.teamName] : []
    );
    if (
      groups.length > 0 &&
      groups.every((group) => teamIds.has(group.teamId))
    ) {
      parts.push("All teams");
    } else {
      parts.push(
        names.length === time.assignedTeamIds.length && names.length <= 3
          ? joinNames(names)
          : `${time.assignedTeamIds.length} teams`
      );
    }
  }
  const positions = groups.flatMap((group) => group.positions);
  if (time.assignedPositionIds.length > 0) {
    const names = positions.flatMap((position) =>
      positionIds.has(position.id) ? [position.name] : []
    );
    parts.push(
      names.length === time.assignedPositionIds.length && names.length <= 2
        ? joinNames(names)
        : `${time.assignedPositionIds.length} positions`
    );
  }
  const slots = positions.filter(
    (position) =>
      position.timeId === time.id &&
      position.neededPositionId !== undefined &&
      position.neededPositionId !== ""
  );
  if (slots.length === 1) {
    const [slot] = slots;
    parts.push(`${slot.name} slot`);
  } else if (slots.length > 1) {
    parts.push(`${slots.length} plan slots`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
};
export const peopleAtTime = (
  id: string,
  groups: TeamPositionGroup[]
): FilledPositionPerson[] => {
  const seen = new Set<string>();
  const people: FilledPositionPerson[] = [];
  for (const group of groups) {
    for (const position of group.positions) {
      for (const person of position.filledPeople ?? []) {
        const key = person.personId ?? person.name;
        if (
          person.rawStatus !== "D" &&
          person.assignedTimeIds?.includes(id) === true &&
          !seen.has(key)
        ) {
          seen.add(key);
          people.push(person);
        }
      }
    }
  }
  return people;
};
export const toggleId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

export const emptyPlanStart = (
  date: Date | null,
  now: Date,
  zone: string
): Date => {
  if (date === null) {
    return now;
  }
  const wall = formatWallTimeInTimeZone(date, zone);
  if (wall.timeValue !== "00:00") {
    return date;
  }
  return new Date(
    zonedWallTimeToUtcIso(
      wall.dateKey,
      formatWallTimeInTimeZone(now, zone).timeValue,
      zone
    )
  );
};
export const newTimeDraft = (
  times: PlanTime[],
  zone: string,
  date: Date | null,
  now: Date
): EditablePlanTime => {
  const draft = buildDefaultNewPlanTimeEdit(times, zone);
  if (times.length === 0) {
    const wall = formatWallTimeInTimeZone(
      emptyPlanStart(date, now, zone),
      zone
    );
    return {
      ...draft,
      startDate: wall.dateKey,
      startTime: wall.timeValue,
      endDate: wall.dateKey,
    };
  }
  return draft;
};
export const moveTimeStart = (
  draft: EditablePlanTime,
  instant: Date,
  zone: string
): EditablePlanTime => {
  const start = new Date(
    zonedWallTimeToUtcIso(draft.startDate, draft.startTime, zone)
  );
  const length =
    draft.endTime === ""
      ? null
      : Math.max(
          0,
          Date.parse(
            zonedWallTimeToUtcIso(
              draft.endDate || draft.startDate,
              draft.endTime,
              zone
            )
          ) - start.getTime()
        );
  const wall = formatWallTimeInTimeZone(instant, zone);
  const end =
    length === null
      ? wall
      : formatWallTimeInTimeZone(new Date(instant.getTime() + length), zone);
  return {
    ...draft,
    startDate: wall.dateKey,
    startTime: wall.timeValue,
    endDate: end.dateKey,
    endTime: length === null ? "" : end.timeValue,
  };
};
export const draftInstant = (
  draft: EditablePlanTime,
  edge: "start" | "end",
  zone: string
): Date =>
  new Date(
    zonedWallTimeToUtcIso(
      edge === "start" ? draft.startDate : draft.endDate || draft.startDate,
      edge === "start" ? draft.startTime : draft.endTime || draft.startTime,
      zone
    )
  );
export const validateTimeDraft = (
  draft: EditablePlanTime,
  zone: string
): string | null => {
  if (draft.name.trim() === "") {
    return "Time name is required.";
  }
  try {
    const start = draftInstant(draft, "start", zone);
    const end = draftInstant(draft, "end", zone);
    if (draft.endTime !== "" && end < start) {
      return "End time must be after start time.";
    }
    return null;
  } catch {
    return "Choose a valid date and time.";
  }
};

export const timeDraftChanged = (
  left: EditablePlanTime,
  right: EditablePlanTime
): boolean => {
  const fields = [
    [left.name, right.name],
    [left.timeType, right.timeType],
    [left.startDate, right.startDate],
    [left.startTime, right.startTime],
    [left.endDate, right.endDate],
    [left.endTime, right.endTime],
  ];
  if (fields.some(([before, after]) => before !== after)) {
    return true;
  }
  return [
    [left.assignedTeamIds, right.assignedTeamIds],
    [left.assignedPositionIds, right.assignedPositionIds],
    [left.assignedNeededPositionIds, right.assignedNeededPositionIds],
    [left.assignedPlanPersonIds, right.assignedPlanPersonIds],
  ].some(([before, after]) => {
    const values = new Set(before);
    return (
      before.length !== after.length || after.some((id) => !values.has(id))
    );
  });
};
