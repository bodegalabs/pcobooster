import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { describe, expect, it } from "vitest";

import {
  activeFirst,
  arrangementRows,
  formatLength,
  historyCountLine,
  historyDateLabel,
  historyNamesArrangements,
  historyRowDetail,
  keyOptionLabel,
  historyServiceTypeId,
  planningCenterArrangementUrl,
  serviceTypeCounts,
  songFacts,
  songIdentity,
  songLoadFailure,
  songScreenFailure,
  splitSongHistory,
} from "./detail";
import type { ArrangementOption, SongHistoryEntry } from "./detail";

const now = new Date("2026-10-07T18:00:00.000Z");
const zone = "America/Los_Angeles";

const entry = (
  sortDate: string,
  serviceTypeName: string,
  overrides: Partial<SongHistoryEntry> = {}
): SongHistoryEntry => ({
  planId: `plan-${sortDate}`,
  serviceTypeId: serviceTypeName === "" ? null : `st-${serviceTypeName}`,
  serviceTypeName,
  sortDate: new Date(sortDate),
  keyName: "Original",
  startingKey: "G",
  arrangementName: "Default Arrangement",
  ...overrides,
});

// Newest first, as `songs.history` answers.
const history = [
  entry("2026-11-07T03:00:00.000Z", "Special Events"),
  entry("2026-11-01T17:00:00.000Z", "Sunday Gathering"),
  // Saturday evening in Los Angeles, Sunday in UTC.
  entry("2026-10-04T03:30:00.000Z", "Sunday Gathering", {
    startingKey: "A",
    keyName: "Jordan's key",
  }),
  entry("2026-08-16T16:00:00.000Z", "Youth Night", {
    arrangementName: "Acoustic",
  }),
  entry("2025-12-21T17:00:00.000Z", "Sunday Gathering"),
];

describe("song history facts", () => {
  it("splits upcoming plans soonest first from past plans newest first", () => {
    const { upcoming, past } = splitSongHistory(history, now);
    expect(upcoming.map((row) => row.serviceTypeName)).toStrictEqual([
      "Sunday Gathering",
      "Special Events",
    ]);
    expect(past.map((row) => row.sortDate.toISOString())).toStrictEqual([
      "2026-10-04T03:30:00.000Z",
      "2026-08-16T16:00:00.000Z",
      "2025-12-21T17:00:00.000Z",
    ]);
  });

  it("counts the past year by service type, most first, naming unknown services", () => {
    const { past } = splitSongHistory(
      [...history, entry("2026-01-04T17:00:00.000Z", "")],
      now
    );
    expect(serviceTypeCounts(past)).toStrictEqual([
      { name: "Sunday Gathering", count: 2 },
      { name: "Unknown service", count: 1 },
      { name: "Youth Night", count: 1 },
    ]);
  });

  it("labels facts on the org's calendar, with the next plan and where it was sung", () => {
    const facts = songFacts(history, now, zone);
    expect(facts).toStrictEqual([
      {
        kind: "value",
        label: "Last sung",
        value: "Oct 3",
        caption: "3d ago",
        accessibilityValue: "Sat, Oct 3, 2026",
      },
      {
        kind: "value",
        label: "Next planned",
        value: "Nov 1",
        caption: "Sunday Gathering",
        accessibilityValue: "Sun, Nov 1, 2026",
      },
      {
        kind: "value",
        label: "Past year",
        value: "3 times",
        caption: "2 at Sunday Gathering, 1 at Youth Night",
        accessibilityValue: "3 times",
      },
      { kind: "keys", label: "Keys", keys: ["G", "A"] },
    ]);
  });

  it("says plainly when the song was never sung or planned", () => {
    expect(songFacts([], now, zone).map((fact) => fact)).toStrictEqual([
      {
        kind: "value",
        label: "Last sung",
        value: "Not in the past year",
        caption: null,
        accessibilityValue: "Not in the past year",
      },
      {
        kind: "value",
        label: "Next planned",
        value: "Not planned",
        caption: null,
        accessibilityValue: "Not planned",
      },
      {
        kind: "value",
        label: "Past year",
        value: "0 times",
        caption: null,
        accessibilityValue: "0 times",
      },
      { kind: "keys", label: "Keys", keys: [] },
    ]);
    expect(historyCountLine([], now)).toBe("Not sung in the past year");
  });

  it("summarizes the count line with each service type", () => {
    expect(historyCountLine(history, now)).toBe(
      "Sung 3 times in the past year · 2 at Sunday Gathering, 1 at Youth Night"
    );
  });

  it("names arrangements only when the history spans several, and named keys", () => {
    expect(historyNamesArrangements(history)).toBeTruthy();
    expect(historyNamesArrangements(history.slice(0, 2))).toBeFalsy();
    expect(historyRowDetail(history[2], true)).toBe(
      "Default Arrangement · Jordan's key"
    );
    expect(historyRowDetail(history[0], false)).toBeNull();
  });

  it("dates history rows with the weekday this year and the year otherwise", () => {
    expect(
      historyDateLabel(new Date("2026-10-04T03:30:00.000Z"), now, zone)
    ).toBe("Sat, Oct 3");
    expect(
      historyDateLabel(new Date("2025-12-21T17:00:00.000Z"), now, zone)
    ).toBe("Dec 21, 2025");
  });
});

const option = (overrides: Partial<ArrangementOption>): ArrangementOption => ({
  id: "a",
  name: "Default",
  sequence: [],
  length: null,
  bpm: null,
  meter: null,
  archived: false,
  keys: [],
  ...overrides,
});

describe("arrangements", () => {
  it("lists active arrangements before archived ones with tempo, meter, and length", () => {
    const rows = arrangementRows([
      option({ id: "old", archived: true, name: "" }),
      option({ id: "main", bpm: 74, meter: "4/4", length: 300 }),
    ]);
    expect(rows.map((row) => [row.id, row.name, row.facts])).toStrictEqual([
      ["main", "Default", "74 bpm · 4/4 · 5:00"],
      ["old", "Untitled arrangement", null],
    ]);
  });

  it("falls back to the chart's arrangements until options load", () => {
    const rows = arrangementRows(undefined, [
      {
        id: "c",
        name: "Chart",
        archived: false,
        chordChart: "",
        chordChartKey: null,
        lyrics: "",
        keys: [],
        layout: {
          font: null,
          fontSize: null,
          columns: null,
          chordColor: null,
          pageSize: null,
          orientation: null,
          margin: null,
        },
        updatedAt: null,
      },
    ]);
    expect(rows.map((row) => [row.id, row.facts])).toStrictEqual([["c", null]]);
    expect(activeFirst([])).toStrictEqual([]);
  });

  it("formats lengths and key labels", () => {
    expect(formatLength(3723)).toBe("1:02:03");
    expect(formatLength(0)).toBeNull();
    expect(
      keyOptionLabel({
        id: "k",
        name: "Jordan's key",
        startingKey: "Bb",
        endingKey: null,
      })
    ).toBe("Jordan's key (B♭)");
    expect(
      keyOptionLabel({ id: "k", name: "", startingKey: null, endingKey: null })
    ).toBe("No key");
  });

  it("reads options under the latest service type the song was sung at", () => {
    expect(historyServiceTypeId(history)).toBe("st-Special Events");
    expect(
      historyServiceTypeId([entry("2026-01-04T17:00:00.000Z", "")])
    ).toBeNull();
    expect(historyServiceTypeId([])).toBeNull();
  });

  it("encodes Planning Center links", () => {
    expect(planningCenterArrangementUrl("5 01", "a/1")).toBe(
      "https://services.planningcenteronline.com/songs/5%2001/arrangements/a%2F1"
    );
  });
});

const failed = (error: Error) => ({ status: "error" as const, error });

describe("song load failures", () => {
  const pending = { status: "pending" as const, error: null };

  it("maps faults to what would help", () => {
    expect(
      songLoadFailure(new NotFound({ message: "gone", resource: "song" }))
    ).toStrictEqual({
      kind: "not-found",
    });
    expect(
      songLoadFailure(new Forbidden({ message: "Needs Viewer access." }))
    ).toStrictEqual({ kind: "no-access", message: "Needs Viewer access." });
    expect(songLoadFailure(new Error("offline"))).toStrictEqual({
      kind: "failed",
    });
  });

  it("fails the whole screen only when nothing names the song and every read failed", () => {
    const notFound = new NotFound({ message: "gone", resource: "song" });
    expect(
      songScreenFailure({
        titleKnown: false,
        history: failed(new Error("offline")),
        options: null,
        chart: failed(notFound),
      })
    ).toStrictEqual({ kind: "not-found" });
    expect(
      songScreenFailure({
        titleKnown: false,
        history: failed(new Error("offline")),
        options: null,
        chart: pending,
      })
    ).toBeNull();
    expect(
      songScreenFailure({
        titleKnown: true,
        history: failed(new Error("offline")),
        options: null,
        chart: failed(notFound),
      })
    ).toBeNull();
  });
});

describe(songIdentity, () => {
  it("names the song from the first read that knows it, with trimmed themes", () => {
    expect(
      songIdentity(
        [
          undefined,
          { title: "  ", author: "Maya Ellison" },
          { title: "Later", author: "" },
        ],
        "Praise, , Morning "
      )
    ).toStrictEqual({
      title: "Untitled song",
      rawTitle: "  ",
      author: "Maya Ellison",
      themes: ["Praise", "Morning"],
    });
    expect(songIdentity([undefined], "")).toStrictEqual({
      title: null,
      rawTitle: null,
      author: "",
      themes: [],
    });
  });
});
