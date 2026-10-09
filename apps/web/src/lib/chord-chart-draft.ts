import { chordChartLayoutSchema } from "@pcobooster/contracts/http/chord-charts";
import type { ChordChartLayout } from "@pcobooster/contracts/http/chord-charts";
import { Schema } from "effect";

import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { storedJson } from "@/lib/stored-json";

/** What the editor changes; saving writes it to the arrangement. */
export interface ChordChartDraft {
  readonly chart: string;
  readonly key: string | null;
  readonly layout: ChordChartLayout;
}

const draftSchema = Schema.Struct({
  chart: Schema.String,
  key: Schema.NullOr(Schema.String),
  layout: chordChartLayoutSchema,
});

/** What this browser keeps of one arrangement's editing between visits. */
const storedSessionSchema = Schema.Struct({
  /** When this browser last wrote it, in epoch milliseconds. */
  savedAt: Schema.Finite,
  /** The Planning Center version (`updated_at`) the edits build on. */
  baseUpdatedAt: Schema.NullOr(Schema.String),
  /** Edits not yet saved to Planning Center, or null when everything is saved. */
  draft: Schema.NullOr(draftSchema),
  /** The chart as it was when editing began, so Revert all changes survives a reload. */
  opening: draftSchema,
});

export type StoredChordChartSession = typeof storedSessionSchema.Type;

const storedSession = storedJson(storedSessionSchema);

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
  const parsed = storedSession.parse(raw);
  if (parsed === undefined) {
    return null;
  }
  return now - parsed.savedAt > CHORD_CHART_DRAFT_LIFETIME_MS ? null : parsed;
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
    session === null ? null : (storedSession.stringify(session) ?? null)
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
