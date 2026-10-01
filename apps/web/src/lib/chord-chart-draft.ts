import { chordChartLayoutSchema } from "@pcobooster/contracts/chord-charts";
import type { ChordChartLayout } from "@pcobooster/contracts/chord-charts";
import { z } from "zod";

import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

/** What the editor changes; saving writes it to the arrangement. */
export interface ChordChartDraft {
  readonly chart: string;
  readonly key: string | null;
  readonly layout: ChordChartLayout;
}

const draftSchema = z.object({
  chart: z.string(),
  key: z.string().nullable(),
  layout: chordChartLayoutSchema,
});

/** What this browser keeps of one arrangement's editing between visits. */
const storedSessionSchema = z.object({
  /** When this browser last wrote it, in epoch milliseconds. */
  savedAt: z.number(),
  /** The Planning Center version (`updated_at`) the edits build on. */
  baseUpdatedAt: z.string().nullable(),
  /** Edits not yet saved to Planning Center, or null when everything is saved. */
  draft: draftSchema.nullable(),
  /** The chart as it was when editing began, so Revert all changes survives a reload. */
  opening: draftSchema,
});

export type StoredChordChartSession = z.output<typeof storedSessionSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
/** A draft left alone this long is dropped rather than resurfacing over newer work. */
export const CHORD_CHART_DRAFT_LIFETIME_MS = 14 * DAY_MS;

const STORAGE_PREFIX = "pcobooster:chord-chart-draft:";

const storageKey = (arrangementId: string) =>
  `${STORAGE_PREFIX}${arrangementId}`;

export const isSameDraft = (
  left: ChordChartDraft,
  right: ChordChartDraft
): boolean =>
  left.chart === right.chart &&
  left.key === right.key &&
  JSON.stringify(left.layout) === JSON.stringify(right.layout);

/** A stored session, or null when it is missing, unreadable, or past its lifetime. */
export const parseStoredChordChartSession = (
  raw: string | null,
  now: number
): StoredChordChartSession | null => {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    return now - parsed.data.savedAt > CHORD_CHART_DRAFT_LIFETIME_MS
      ? null
      : parsed.data;
  } catch {
    return null;
  }
};

/** Reads without writing, so it is safe while rendering. */
export const readChordChartSession = (
  arrangementId: string,
  now: number = Date.now()
): StoredChordChartSession | null =>
  parseStoredChordChartSession(
    readBrowserStorage(storageKey(arrangementId)),
    now
  );

export const writeChordChartSession = (
  arrangementId: string,
  session: StoredChordChartSession | null
): void => {
  writeBrowserStorage(
    storageKey(arrangementId),
    session === null ? null : JSON.stringify(session)
  );
};

/** The storage keys of every chart draft this browser keeps. */
const storedDraftKeys = (): string[] => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return [];
  }
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(STORAGE_PREFIX) === true) {
        keys.push(key);
      }
    }
  } catch {
    // Blocked storage holds no drafts to list.
  }
  return keys;
};

/** Drops drafts past their lifetime and ones this version of the editor can't read. */
export const pruneChordChartDrafts = (now: number): void => {
  for (const key of storedDraftKeys()) {
    if (parseStoredChordChartSession(readBrowserStorage(key), now) === null) {
      writeBrowserStorage(key, null);
    }
  }
};

/** Drafts belong to one organization's arrangements, so switching accounts forgets them. */
export const clearChordChartDrafts = (): void => {
  for (const key of storedDraftKeys()) {
    writeBrowserStorage(key, null);
  }
};
