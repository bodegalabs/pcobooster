import {
  formatWallTimeInTimeZone,
  zonedWallTimeToUtcIso,
} from "@pcobooster/planning-center-models/calendar";
import type { PlanTime } from "@pcobooster/planning-center-models/types";

import { effectiveEnd } from "./logic";

const HOUR = 3_600_000;
const POINT_LENGTH = 15 * 60_000;
const floorHour = (date: Date, zone: string): number => {
  const wall = formatWallTimeInTimeZone(date, zone);
  return Date.parse(
    zonedWallTimeToUtcIso(
      wall.dateKey,
      `${wall.timeValue.slice(0, 2)}:00`,
      zone
    )
  );
};

/** Swift DayTimelineLayout, including overlap lanes, point times, and gaps across the full reach. */
export const dayTimeline = (times: PlanTime[], zone: string) => {
  const ordered = times.toSorted(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
  );
  const [first] = ordered;
  if (first === undefined) {
    return { blocks: [], gaps: [], ticks: [], laneCount: 1 };
  }
  const ends = ordered.map((time) =>
    Math.max(effectiveEnd(time), time.startsAt.getTime() + POINT_LENGTH)
  );
  const start = floorHour(first.startsAt, zone);
  const last = Math.max(...ends);
  const lastFloor = floorHour(new Date(last), zone);
  const end = Math.max(
    lastFloor < last ? lastFloor + HOUR : lastFloor,
    start + 2 * HOUR
  );
  const length = end - start;
  const laneEnds: number[] = [];
  const gaps: { start: number; end: number; seconds: number }[] = [];
  let reach: number | null = null;
  const blocks = ordered.map((time, index) => {
    const begins = time.startsAt.getTime();
    const finishes = ends[index];
    const free = laneEnds.findIndex((value) => value <= begins);
    const lane = free === -1 ? Math.min(laneEnds.length, 2) : free;
    laneEnds[lane] = Math.max(laneEnds[lane] ?? finishes, finishes);
    if (reach !== null && begins > reach) {
      gaps.push({
        start: (reach - start) / length,
        end: (begins - start) / length,
        seconds: (begins - reach) / 1000,
      });
    }
    reach = Math.max(reach ?? finishes, finishes);
    return {
      time,
      start: (begins - start) / length,
      end: (finishes - start) / length,
      lane,
    };
  });
  const hourCount = Math.round(length / HOUR);
  const ticks = Array.from({ length: hourCount + 1 }, (_, index) => {
    const wall = formatWallTimeInTimeZone(new Date(start + index * HOUR), zone);
    const hour = Number(wall.timeValue.slice(0, 2));
    return {
      fraction: index / hourCount,
      label: `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`,
    };
  });
  return { blocks, gaps, ticks, laneCount: Math.max(1, laneEnds.length) };
};
