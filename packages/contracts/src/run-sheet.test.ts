import { planItemSchema } from "@pcobooster/contracts/http/plan-item-schemas";
import {
  planItemsCreateInputSchema,
  planItemsReorderInputSchema,
  planItemsSuccessSchema,
  planItemsUpdateInputSchema,
} from "@pcobooster/contracts/http/plan-items";
import { planPeopleUpdateTimesInputSchema } from "@pcobooster/contracts/http/plan-people";
import { planTimeSchema } from "@pcobooster/contracts/http/plan-time-schemas";
import {
  planTimesCreateInputSchema,
  planTimesUpdateInputSchema,
} from "@pcobooster/contracts/http/plan-times";
import { songOptionSetSchema } from "@pcobooster/contracts/http/song-schemas";
import { songsSearchInputSchema } from "@pcobooster/contracts/http/songs";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const scope = { serviceTypeId: "service-1", planId: "plan-1" };
const lastScheduledAt = new Date("2026-09-13T17:00:00Z");
const archivedAt = new Date("2026-09-01T12:00:00Z");
const song = {
  id: "song-1",
  title: "Song",
  author: "Author",
  themes: "Hope",
  lastScheduledAt,
};
const key = { id: "key-1", name: "C", startingKey: "C", endingKey: null };
const layout = { id: "layout-1", name: "Default" };
const item = {
  id: "item-1",
  title: "Song",
  itemType: "song",
  sequence: 2,
  servicePosition: "during",
  length: 300,
  description: "Description",
  htmlDetails: "Details",
  customArrangementSequence: ["V1", "C", "V2", "C"],
  song,
  arrangement: {
    id: "arrangement-1",
    name: "Original",
    sequence: ["V1", "C"],
    length: 300,
    archivedAt,
  },
  key,
  layout,
};
const planTime = {
  id: "time-1",
  name: "Service",
  startsAt: new Date("2026-09-20T17:00:00Z"),
  endsAt: new Date("2026-09-20T18:00:00Z"),
  timeType: "service",
  teamReminders: { teamId: "team-1", minutes: 15 },
  assignedTeamIds: ["team-1"],
  assignedPositionIds: ["position-1"],
  splitTeamRehearsalAssignmentIds: ["assignment-1"],
};

describe("run-sheet contracts", () => {
  it("retains every nested plan-item field and requires native dates", () => {
    expect(Schema.decodeUnknownSync(planItemSchema)(item)).toStrictEqual(item);
    expect(() =>
      Schema.decodeUnknownSync(planItemSchema)({
        ...item,
        song: { ...song, lastScheduledAt: lastScheduledAt.toISOString() },
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(planItemSchema)({
        ...item,
        arrangement: {
          ...item.arrangement,
          archivedAt: archivedAt.toISOString(),
        },
      })
    ).toThrow(Schema.SchemaError);
    const header = {
      ...item,
      itemType: "header",
      length: null,
      song: null,
      arrangement: null,
      key: null,
      layout: null,
    };
    expect(Schema.decodeUnknownSync(planItemSchema)(header)).toStrictEqual(
      header
    );
  });

  it("retains full song options with nullable dates and optional ranking", () => {
    const options = {
      song: { ...song, hidden: false, matchScore: 12 },
      arrangements: [
        {
          id: "arrangement-1",
          name: "Original",
          sequence: ["V1", "C"],
          length: null,
          bpm: null,
          meter: null,
          archived: false,
          keys: [key],
        },
      ],
      layouts: [layout],
      currentLayout: layout,
      suggestedArrangementId: "arrangement-1",
      suggestedKeyId: "key-1",
      suggestedLayoutId: "layout-1",
      layoutMode: "existing-only",
    };
    expect(
      Schema.decodeUnknownSync(songOptionSetSchema)(options)
    ).toStrictEqual(options);
    const noHistory = {
      ...options,
      song: { ...song, hidden: false, lastScheduledAt: null },
      currentLayout: null,
      suggestedArrangementId: null,
      suggestedKeyId: null,
      suggestedLayoutId: null,
      layoutMode: "unavailable",
    };
    expect(
      Schema.decodeUnknownSync(songOptionSetSchema)(noHistory)
    ).toStrictEqual(noHistory);
    expect(
      Schema.decodeUnknownSync(songOptionSetSchema)(noHistory).song
    ).not.toHaveProperty("matchScore");
  });

  it("preserves null associations, omitted fields, and empty arrangement sequences", () => {
    const omitted = Schema.decodeUnknownSync(planItemsCreateInputSchema)(scope);
    expect(omitted).toStrictEqual(scope);
    const explicit = {
      ...scope,
      itemId: "item-1",
      songId: null,
      arrangementId: null,
      keyId: null,
      selectedLayoutId: null,
      length: null,
      customArrangementSequence: [],
    };
    expect(
      Schema.decodeUnknownSync(planItemsUpdateInputSchema)(explicit)
    ).toStrictEqual(explicit);
    expect(() =>
      Schema.decodeUnknownSync(planItemsCreateInputSchema)({
        ...scope,
        songId: " ",
      })
    ).toThrow(Schema.SchemaError);
  });

  it("retains native plan-time dates, reminders, and every assignment relationship", () => {
    expect(Schema.decodeUnknownSync(planTimeSchema)(planTime)).toStrictEqual(
      planTime
    );
    expect(
      Schema.decodeUnknownSync(planTimeSchema)({ ...planTime, endsAt: null })
    ).toStrictEqual({
      ...planTime,
      endsAt: null,
    });
    expect(() =>
      Schema.decodeUnknownSync(planTimeSchema)({
        ...planTime,
        startsAt: planTime.startsAt.toISOString(),
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(planTimeSchema)({
        ...planTime,
        endsAt: new Date(Number.NaN),
      })
    ).toThrow(Schema.SchemaError);
  });

  it("distinguishes omitted time assignments from explicitly cleared arrays", () => {
    const input = { ...scope, planTimeId: "time-1" };
    expect(
      Schema.decodeUnknownSync(planTimesUpdateInputSchema)(input)
    ).toStrictEqual(input);
    const cleared = {
      ...input,
      endsAt: null,
      assignedTeamIds: [],
      assignedPositionIds: [],
      assignedNeededPositionIds: [],
      clearedNeededPositionIds: [],
      assignedPlanPersonIds: [],
      clearedPlanPersonIds: [],
    };
    expect(
      Schema.decodeUnknownSync(planTimesUpdateInputSchema)(cleared)
    ).toStrictEqual(cleared);
    const person = {
      ...scope,
      personId: "person-1",
      planPersonId: "plan-person-1",
      planTimeIds: [],
    };
    expect(
      Schema.decodeUnknownSync(planPeopleUpdateTimesInputSchema)(person)
    ).toStrictEqual(person);
    expect(() =>
      Schema.decodeUnknownSync(planPeopleUpdateTimesInputSchema)({
        ...scope,
        personId: "person-1",
        planPersonId: "plan-person-1",
      })
    ).toThrow(Schema.SchemaError);
  });

  it("validates required time fields and supported item creation values", () => {
    expect(
      Schema.decodeUnknownSync(planTimesCreateInputSchema)({
        ...scope,
        startsAt: "2026-09-20T17:00:00Z",
        timeType: "service",
      })
    ).toStrictEqual({
      ...scope,
      startsAt: "2026-09-20T17:00:00Z",
      timeType: "service",
    });
    expect(() =>
      Schema.decodeUnknownSync(planTimesCreateInputSchema)({
        ...scope,
        startsAt: "2026-09-20",
        timeType: "service",
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(planItemsCreateInputSchema)({
        ...scope,
        itemType: "song",
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(planItemsCreateInputSchema)({
        ...scope,
        length: -1,
      })
    ).toThrow(Schema.SchemaError);
  });

  it("requires an ordered sequence and a nonblank search query", () => {
    expect(() =>
      Schema.decodeUnknownSync(planItemsReorderInputSchema)({
        ...scope,
        sequence: [],
      })
    ).toThrow(Schema.SchemaError);
    const ordering = { ...scope, sequence: ["second", "first"] };
    expect(
      Schema.decodeUnknownSync(planItemsReorderInputSchema)(ordering)
    ).toStrictEqual(ordering);
    expect(() =>
      Schema.decodeUnknownSync(songsSearchInputSchema)({
        serviceTypeId: "service-1",
        query: " ",
      })
    ).toThrow(Schema.SchemaError);
  });

  it("requires a success literal", () => {
    expect(() =>
      Schema.decodeUnknownSync(planItemsSuccessSchema)({ success: false })
    ).toThrow(Schema.SchemaError);
  });
});
