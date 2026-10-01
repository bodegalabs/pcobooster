import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHORD_CHART_DRAFT_LIFETIME_MS,
  clearChordChartDrafts,
  isSameDraft,
  parseStoredChordChartSession,
  pruneChordChartDrafts,
  readChordChartSession,
  writeChordChartSession,
} from "@/lib/chord-chart-draft";

const layout = {
  font: null,
  fontSize: 12,
  columns: 2,
  chordColor: 1,
  pageSize: "Letter",
  orientation: "Portrait",
  margin: "0.5in",
} as const;

const NOW = Date.UTC(2026, 9, 1, 12);

const storedSession = (savedAt: number) => ({
  savedAt,
  baseUpdatedAt: "2026-09-01T12:00:00Z",
  draft: { chart: "VERSE\n[G]Amazing", key: "G", layout },
  opening: { chart: "VERSE", key: "G", layout },
});

const installLocalStorageMock = () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return storage.size;
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
    dispatchEvent: () => true,
  });
  return storage;
};

describe("chord chart drafts", () => {
  let storage = new Map<string, string>();

  beforeEach(() => {
    storage = installLocalStorageMock();
  });

  it("round-trips an editing session through browser storage", () => {
    const session = storedSession(NOW);
    writeChordChartSession("arr-1", session);
    expect(readChordChartSession("arr-1", NOW)).toStrictEqual(session);
    writeChordChartSession("arr-1", null);
    expect(readChordChartSession("arr-1", NOW)).toBeNull();
  });

  it("drops a session left alone past its lifetime", () => {
    const raw = JSON.stringify(storedSession(NOW));
    expect(
      parseStoredChordChartSession(raw, NOW + CHORD_CHART_DRAFT_LIFETIME_MS)
    ).not.toBeNull();
    expect(
      parseStoredChordChartSession(raw, NOW + CHORD_CHART_DRAFT_LIFETIME_MS + 1)
    ).toBeNull();
  });

  it("reads drafts saved before sessions were stored as nothing", () => {
    const legacy = JSON.stringify({
      chart: "VERSE",
      key: "G",
      layout,
      baseUpdatedAt: null,
    });
    expect(parseStoredChordChartSession(legacy, NOW)).toBeNull();
    expect(parseStoredChordChartSession("{not json", NOW)).toBeNull();
  });

  it("prunes expired and unreadable drafts and leaves other storage alone", () => {
    writeChordChartSession("fresh", storedSession(NOW));
    writeChordChartSession(
      "expired",
      storedSession(NOW - CHORD_CHART_DRAFT_LIFETIME_MS - 1)
    );
    storage.set("pcobooster:chord-chart-draft:legacy", "{}");
    storage.set("pcobooster:recent-songs", "[]");
    pruneChordChartDrafts(NOW);
    expect([...storage.keys()].toSorted()).toStrictEqual([
      "pcobooster:chord-chart-draft:fresh",
      "pcobooster:recent-songs",
    ]);
  });

  it("forgets every draft on an account switch", () => {
    writeChordChartSession("arr-1", storedSession(NOW));
    writeChordChartSession("arr-2", storedSession(NOW));
    storage.set("pcobooster:recent-songs", "[]");
    clearChordChartDrafts();
    expect([...storage.keys()]).toStrictEqual(["pcobooster:recent-songs"]);
  });

  it("compares drafts by chart, key, and layout", () => {
    const draft = { chart: "A", key: "G", layout };
    expect(isSameDraft(draft, { ...draft })).toBeTruthy();
    expect(isSameDraft(draft, { ...draft, key: "A" })).toBeFalsy();
    expect(
      isSameDraft(draft, { ...draft, layout: { ...layout, columns: 1 } })
    ).toBeFalsy();
  });
});
