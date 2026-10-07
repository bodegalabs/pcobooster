import { formatDuration } from "@pcobooster/planning-center-models/plan-overview";
import { tempoLabel } from "@pcobooster/planning-center-models/song-library";
import type {
  ArrangementOption,
  KeyOption,
  PlanItem,
  PlanItemArrangement,
  SongOptionSet,
} from "@pcobooster/planning-center-models/types";

import { isPlaceholderId } from "../placeholder-ids";

export const itemTitle = (item: PlanItem): string =>
  item.title === "" ? "Untitled item" : item.title;
export const lengthLabel = (seconds: number | null): string =>
  seconds === null ? "-:--" : (formatDuration(seconds) ?? "-:--");
export const songUrl = (songId: string): string =>
  `https://services.planningcenteronline.com/songs/${songId}`;
/** A picked arrangement as the item shows it (a pickable arrangement isn't archived). */
const chosenArrangement = (option: ArrangementOption): PlanItemArrangement => ({
  id: option.id,
  name: option.name,
  sequence: option.sequence,
  length: option.length,
  archivedAt: null,
});
/** A song's arrangement and key after a pick: undefined keeps the current one, null clears it. */
export const pickedSong = (
  item: PlanItem,
  arrangement: ArrangementOption | null | undefined,
  key: KeyOption | null | undefined
): Pick<PlanItem, "arrangement" | "key"> => {
  let chosen = item.arrangement;
  if (arrangement === null) {
    chosen = null;
  } else if (arrangement !== undefined) {
    chosen = chosenArrangement(arrangement);
  }
  return { arrangement: chosen, key: key === undefined ? item.key : key };
};
/** The arrangements a key can be picked from: live ones that have keys. */
export const keyedArrangements = (
  options?: SongOptionSet
): ArrangementOption[] =>
  (options?.arrangements ?? []).filter(
    (arrangement) => !arrangement.archived && arrangement.keys.length > 0
  );
/** Picking the item's own arrangement and key changes nothing. */
export const isCurrentKey = (
  item: PlanItem,
  arrangement: ArrangementOption,
  key: KeyOption
): boolean =>
  item.arrangement?.id === arrangement.id && item.key?.id === key.id;
/** "4 songs, 10 items" (Swift's run sheet summary). */
export const summaryCounts = (songs: number, items: number): string =>
  `${songs === 1 ? "1 song" : `${songs} songs`}, ${items} items`;
export const recentLabel = (days: number): string =>
  days < 7 ? `${days}d ago` : `${Math.round(days / 7)}w ago`;
/**
 * A song's arrangement name and tempo ("Default · 120 bpm · 4/4"; tempo once its options load).
 * Beside a recent-play hint the line has room for less, so the arrangement name gives way first
 * and tempo stays whole (Swift's ViewThatFits).
 */
export const rowFacts = (
  item: PlanItem,
  options: SongOptionSet | undefined,
  besideRecentPlay: boolean
): string => {
  const name = item.arrangement?.name ?? "";
  const tempo = tempoLabel(
    options?.arrangements.find(
      (candidate) => candidate.id === item.arrangement?.id
    )
  );
  const parts = [name, tempo].filter((part) => part !== "");
  return (besideRecentPlay && parts.length > 1 ? [tempo] : parts).join(" · ");
};
/** Where "Add to section" inserts: after the section's last created item, else after its header. */
export const sectionEnd = (items: PlanItem[], headerId: string): string => {
  const start = items.findIndex((item) => item.id === headerId);
  let end = headerId;
  for (const item of items.slice(start + 1)) {
    if (item.itemType === "header") {
      break;
    }
    if (!isPlaceholderId(item.id)) {
      end = item.id;
    }
  }
  return end;
};

export const editorTitle = (item: PlanItem): string => {
  if (item.song !== null) {
    return "Song";
  }
  return item.itemType === "header" ? "Header" : "Item";
};
