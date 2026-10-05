import { planItems, songs } from "./fixtures";
import type { DemoPlanItem, DemoSong } from "./fixtures";
import { createStore } from "./store";

const SECONDS_PER_MINUTE = 60;
const NEW_ITEM_SECONDS = 3 * SECONDS_PER_MINUTE;
const NEW_SONG_SECONDS = 5 * SECONDS_PER_MINUTE;
const LENGTH_PATTERN = /^(?<minutes>\d+):(?<seconds>[0-5]\d)$/u;
const MINUTES_PATTERN = /^\d+$/u;

// Module-level so the Overview's readiness checks follow edits made here.
const planStore = createStore<readonly DemoPlanItem[]>(planItems);

export const usePlanItems = (): readonly DemoPlanItem[] =>
  planStore.use((items) => items);

export const resetPlan = () => {
  planStore.set(planItems);
};

export const findSong = (songId: string | undefined): DemoSong | undefined =>
  songs.find((song) => song.id === songId);

/** The first library song this plan doesn't use yet. */
export const nextUnusedSong = (
  items: readonly DemoPlanItem[]
): DemoSong | undefined => {
  const used = new Set(items.map((item) => item.songId));
  return songs.find((song) => !used.has(song.id));
};

/** "5:00" or a bare "5" for minutes; null when it isn't a length. */
export const parseLength = (text: string): number | null => {
  const value = text.trim();
  const clock = LENGTH_PATTERN.exec(value)?.groups;
  if (clock !== undefined) {
    return Number(clock.minutes) * SECONDS_PER_MINUTE + Number(clock.seconds);
  }
  return MINUTES_PATTERN.test(value)
    ? Number(value) * SECONDS_PER_MINUTE
    : null;
};

/** "5:00": minutes and seconds, as the product writes a length. */
export const formatLength = (seconds: number): string =>
  `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;

export type PlanItemPatch = Partial<
  Pick<DemoPlanItem, "title" | "notes" | "songKey" | "seconds" | "when">
>;

export const updatePlanItem = (id: string, patch: PlanItemPatch) => {
  planStore.set(
    planStore
      .get()
      .map((item) => (item.id === id ? { ...item, ...patch } : item))
  );
};

export const removePlanItem = (id: string) => {
  planStore.set(planStore.get().filter((item) => item.id !== id));
};

let createdCount = 0;

/** Adds an item after another (or at the end) and returns it. */
export const insertPlanItem = (
  kind: DemoPlanItem["kind"],
  afterId: string | null
): DemoPlanItem | null => {
  const items = planStore.get();
  const song = kind === "song" ? nextUnusedSong(items) : undefined;
  if (kind === "song" && song === undefined) {
    return null;
  }
  createdCount += 1;
  const id = `new-${createdCount}`;
  const added: DemoPlanItem =
    song === undefined
      ? {
          id,
          title: kind === "header" ? "New header" : "New item",
          kind,
          notes: "",
          seconds: kind === "header" ? 0 : NEW_ITEM_SECONDS,
          when: "during",
        }
      : {
          id,
          title: song.title,
          kind,
          notes: "",
          songId: song.id,
          songKey: song.keys[0],
          seconds: NEW_SONG_SECONDS,
          when: "during",
        };
  const index =
    afterId === null
      ? items.length
      : items.findIndex((item) => item.id === afterId) + 1;
  planStore.set([...items.slice(0, index), added, ...items.slice(index)]);
  return added;
};

/** Each header's total: its items' lengths up to the next header. */
export const sectionLengths = (
  items: readonly DemoPlanItem[]
): Map<string, number> => {
  const lengths = new Map<string, number>();
  let current: string | undefined;
  for (const item of items) {
    if (item.kind === "header") {
      current = item.id;
      lengths.set(item.id, 0);
    } else if (current !== undefined) {
      lengths.set(current, (lengths.get(current) ?? 0) + item.seconds);
    }
  }
  return lengths;
};
