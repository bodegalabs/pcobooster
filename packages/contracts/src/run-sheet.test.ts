import { planItemSchema } from "@worship-admin/contracts/plan-item-schemas";
import {
  planItemsCreateInputSchema,
  planItemsReorderInputSchema,
  planItemsSuccessSchema,
  planItemsUpdateInputSchema,
} from "@worship-admin/contracts/plan-items";
import {
  planPeopleUpdateTimesInputSchema,
  planPeopleUpdateTimesOutputSchema,
} from "@worship-admin/contracts/plan-people";
import { planTimeSchema } from "@worship-admin/contracts/plan-time-schemas";
import {
  planTimesCreateInputSchema,
  planTimesDeleteOutputSchema,
  planTimesUpdateInputSchema,
} from "@worship-admin/contracts/plan-times";
import { songOptionSetSchema } from "@worship-admin/contracts/song-schemas";
import { songsSearchInputSchema } from "@worship-admin/contracts/songs";
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
    expect(planItemSchema.parse(item)).toStrictEqual(item);
    expect(
      planItemSchema.safeParse({
        ...item,
        song: { ...song, lastScheduledAt: lastScheduledAt.toISOString() },
      }).success
    ).toBeFalsy();
    expect(
      planItemSchema.safeParse({
        ...item,
        arrangement: {
          ...item.arrangement,
          archivedAt: archivedAt.toISOString(),
        },
      }).success
    ).toBeFalsy();
    const header = {
      ...item,
      itemType: "header",
      length: null,
      song: null,
      arrangement: null,
      key: null,
      layout: null,
    };
    expect(planItemSchema.parse(header)).toStrictEqual(header);
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
    expect(songOptionSetSchema.parse(options)).toStrictEqual(options);
    const noHistory = {
      ...options,
      song: { ...song, hidden: false, lastScheduledAt: null },
      currentLayout: null,
      suggestedArrangementId: null,
      suggestedKeyId: null,
      suggestedLayoutId: null,
      layoutMode: "unavailable",
    };
    expect(songOptionSetSchema.parse(noHistory)).toStrictEqual(noHistory);
    expect(songOptionSetSchema.parse(noHistory).song).not.toHaveProperty(
      "matchScore"
    );
  });

  it("preserves null associations, omitted fields, and empty arrangement sequences", () => {
    const omitted = planItemsCreateInputSchema.parse(scope);
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
    expect(planItemsUpdateInputSchema.parse(explicit)).toStrictEqual(explicit);
    expect(
      planItemsCreateInputSchema.safeParse({ ...scope, songId: " " }).success
    ).toBeFalsy();
  });

  it("retains native plan-time dates, reminders, and every assignment relationship", () => {
    expect(planTimeSchema.parse(planTime)).toStrictEqual(planTime);
    expect(planTimeSchema.parse({ ...planTime, endsAt: null })).toStrictEqual({
      ...planTime,
      endsAt: null,
    });
    expect(
      planTimeSchema.safeParse({
        ...planTime,
        startsAt: planTime.startsAt.toISOString(),
      }).success
    ).toBeFalsy();
    expect(
      planTimeSchema.safeParse({ ...planTime, endsAt: new Date(Number.NaN) })
        .success
    ).toBeFalsy();
  });

  it("distinguishes omitted time assignments from explicitly cleared arrays", () => {
    const input = { ...scope, planTimeId: "time-1" };
    expect(planTimesUpdateInputSchema.parse(input)).toStrictEqual(input);
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
    expect(planTimesUpdateInputSchema.parse(cleared)).toStrictEqual(cleared);
    const person = {
      ...scope,
      personId: "person-1",
      planPersonId: "plan-person-1",
      planTimeIds: [],
    };
    expect(planPeopleUpdateTimesInputSchema.parse(person)).toStrictEqual(
      person
    );
    expect(
      planPeopleUpdateTimesInputSchema.safeParse({
        ...scope,
        personId: "person-1",
        planPersonId: "plan-person-1",
      }).success
    ).toBeFalsy();
  });

  it("validates required time fields and supported item creation values", () => {
    expect(
      planTimesCreateInputSchema.parse({
        ...scope,
        startsAt: "2026-09-20T17:00:00Z",
        timeType: "service",
      })
    ).toStrictEqual({
      ...scope,
      startsAt: "2026-09-20T17:00:00Z",
      timeType: "service",
    });
    expect(
      planTimesCreateInputSchema.safeParse({
        ...scope,
        startsAt: "2026-09-20",
        timeType: "service",
      }).success
    ).toBeFalsy();
    expect(
      planItemsCreateInputSchema.safeParse({ ...scope, itemType: "song" })
        .success
    ).toBeFalsy();
    expect(
      planItemsCreateInputSchema.safeParse({ ...scope, length: -1 }).success
    ).toBeFalsy();
  });

  it("requires an ordered sequence and a nonblank search query", () => {
    expect(
      planItemsReorderInputSchema.safeParse({ ...scope, sequence: [] }).success
    ).toBeFalsy();
    const ordering = { ...scope, sequence: ["second", "first"] };
    expect(planItemsReorderInputSchema.parse(ordering)).toStrictEqual(ordering);
    expect(
      songsSearchInputSchema.safeParse({
        serviceTypeId: "service-1",
        query: " ",
      }).success
    ).toBeFalsy();
  });

  it("requires success literals and an empty time deletion result", () => {
    expect(
      planItemsSuccessSchema.safeParse({ success: false }).success
    ).toBeFalsy();
    expect(
      planPeopleUpdateTimesOutputSchema.safeParse({ ok: false }).success
    ).toBeFalsy();
    expect(planTimesDeleteOutputSchema.safeParse(null).success).toBeFalsy();
  });
});
