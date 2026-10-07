import {
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import type {
  PreviousSong,
  SongPreviewFacts,
} from "@pcobooster/planning-center-models/song-library";

import { displayKey } from "../../../lib/song-keys";

/** A history date in the org's zone: "Dec 27", with the year when it isn't the plan's year. */
export const historyDateLabel = (
  at: Date,
  planDate: Date,
  zone: string
): string =>
  formatCalendarDateLabel(
    at,
    zone,
    formatCalendarDayInTimeZone(at, zone).slice(0, 4) ===
      formatCalendarDayInTimeZone(planDate, zone).slice(0, 4)
      ? "monthDay"
      : "monthDayYear"
  );

export interface PreviewFactRow {
  label: string;
  value: string;
}

export interface PreviewFactLines {
  /** Keys it was sung in (else its arrangements' keys), spelled for display. */
  keys: string[];
  rows: PreviewFactRow[];
  /** Nothing to show: no keys, tempo, or key change. */
  empty: boolean;
}

/** The song preview's facts as shown: keys sung, tempos, and how its key meets the song before. */
export const previewFactRows = (
  facts: SongPreviewFacts,
  previous: PreviousSong | null
): PreviewFactLines => {
  const rows: PreviewFactRow[] = [];
  if (facts.tempos.length > 0) {
    rows.push({ label: "Tempo", value: facts.tempos.join(", ") });
  }
  if (facts.keyChange !== null && previous !== null) {
    rows.push({
      label: `After ${displayKey(previous.endKey)}`,
      value: `${displayKey(facts.keyChange.key)}, ${facts.keyChange.change}`,
    });
  }
  return {
    keys: facts.keys.map(displayKey),
    rows,
    empty:
      facts.keys.length === 0 &&
      facts.tempos.length === 0 &&
      facts.keyChange === null,
  };
};
