import { getPlanItems } from "@pcobooster/api/modules/planning-center/get-plan-items";
import type { PlanItemsReader } from "@pcobooster/api/modules/planning-center/get-plan-items";
import type { SuccessOf } from "@pcobooster/api/testing/effect";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const createFixture = () => {
  const getPlanItemsMock = vi.fn<PlanItemsReader["getPlanItems"]>();
  const planItemsReader = {
    getPlanItems: getPlanItemsMock,
  } satisfies PlanItemsReader;
  return { getPlanItemsMock, planItemsReader };
};

describe(getPlanItems, () => {
  it("normalizes items with included song metadata and layout fallback", async () => {
    const { getPlanItemsMock, planItemsReader } = createFixture();
    getPlanItemsMock.mockReturnValue(
      Effect.succeed<SuccessOf<typeof getPlanItemsMock>>({
        data: [
          {
            id: "2",
            type: "Item",
            attributes: {
              title: "Welcome",
              item_type: "header",
              sequence: 2,
              service_position: "during",
            },
          },
          {
            id: "1",
            type: "Item",
            attributes: {
              title: "Praise",
              item_type: "song",
              sequence: 1,
              service_position: "during",
              length: 240,
              description: "Opener",
              html_details: "<p>Lights up</p>",
              custom_arrangement_sequence: ["Verse 1", "Chorus 1"],
            },
            relationships: {
              song: { data: { type: "Song", id: "song-1" } },
              arrangement: { data: { type: "Arrangement", id: "arr-1" } },
              key: { data: { type: "Key", id: "key-1" } },
              selected_layout: { data: { type: "Layout", id: "layout-1" } },
            },
          },
        ],
        included: [
          {
            id: "song-1",
            type: "Song",
            attributes: {
              title: "Praise",
              author: "Writer",
              themes: "Joy, Hope",
              last_scheduled_at: "2025-01-01T00:00:00Z",
            },
          },
          {
            id: "arr-1",
            type: "Arrangement",
            attributes: {
              name: "Default",
              sequence: ["Verse 1", "Chorus 1"],
              length: 240,
            },
          },
          {
            id: "key-1",
            type: "Key",
            attributes: {
              name: "D",
              starting_key: "D",
              ending_key: "D",
            },
          },
        ],
      })
    );

    const items = await Effect.runPromise(
      getPlanItems("1", "2", planItemsReader)
    );

    expect(items.map((item) => item.id)).toStrictEqual(["1", "2"]);
    expect(items[0]).toMatchObject({
      title: "Praise",
      itemType: "song",
      song: {
        id: "song-1",
        title: "Praise",
      },
      arrangement: {
        id: "arr-1",
        name: "Default",
      },
      key: {
        id: "key-1",
        name: "D",
      },
      layout: {
        id: "layout-1",
        name: "Selected layout",
      },
      customArrangementSequence: ["Verse 1", "Chorus 1"],
    });
  });

  it("falls back to starting and ending key values when key name is blank", async () => {
    const { getPlanItemsMock, planItemsReader } = createFixture();
    getPlanItemsMock.mockReturnValue(
      Effect.succeed<SuccessOf<typeof getPlanItemsMock>>({
        data: [
          {
            id: "1",
            type: "Item",
            attributes: {
              title: "Response",
              item_type: "song",
              sequence: 1,
              service_position: "during",
            },
            relationships: {
              key: { data: { type: "Key", id: "key-1" } },
            },
          },
        ],
        included: [
          {
            id: "key-1",
            type: "Key",
            attributes: {
              name: "",
              starting_key: "Bb",
              ending_key: "C",
            },
          },
        ],
      })
    );

    const items = await Effect.runPromise(
      getPlanItems("1", "2", planItemsReader)
    );

    expect(items[0]?.key).toMatchObject({
      id: "key-1",
      name: "Bb -> C",
      startingKey: "Bb",
      endingKey: "C",
    });
  });
});
