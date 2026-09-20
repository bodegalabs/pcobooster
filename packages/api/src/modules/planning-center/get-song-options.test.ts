import { getSongOptions } from "@worship-admin/api/modules/planning-center/get-song-options";
import type { SongOptionsReader } from "@worship-admin/api/modules/planning-center/get-song-options";
import { describe, expect, it, vi } from "vitest";

const createFixture = () => {
  const getSongMock = vi.fn<SongOptionsReader["getSong"]>();
  const getSongArrangementsWithKeysMock =
    vi.fn<SongOptionsReader["getSongArrangementsWithKeys"]>();
  const getSongLastScheduledItemMock =
    vi.fn<SongOptionsReader["getSongLastScheduledItem"]>();
  const songsReader = {
    getSong: getSongMock,
    getSongArrangementsWithKeys: getSongArrangementsWithKeysMock,
    getSongLastScheduledItem: getSongLastScheduledItemMock,
  } satisfies SongOptionsReader;
  return {
    getSongMock,
    getSongArrangementsWithKeysMock,
    getSongLastScheduledItemMock,
    songsReader,
  };
};

describe(getSongOptions, () => {
  it("prefers the last scheduled arrangement and key when available", async () => {
    const {
      getSongMock,
      getSongArrangementsWithKeysMock,
      getSongLastScheduledItemMock,
      songsReader,
    } = createFixture();
    getSongMock.mockResolvedValue({
      id: "song-1",
      type: "Song",
      attributes: {
        title: "Build My Life",
        author: "Pat Barrett",
        themes: "Surrender",
      },
    });
    getSongArrangementsWithKeysMock.mockResolvedValue({
      data: [
        {
          id: "arr-1",
          type: "Arrangement",
          attributes: { name: "Default", sequence: ["Verse 1"], length: 240 },
        },
      ],
      included: [
        {
          id: "key-1",
          type: "Key",
          attributes: { name: "G", starting_key: "G", ending_key: "G" },
          relationships: {
            arrangement: { data: { type: "Arrangement", id: "arr-1" } },
          },
        },
      ],
    });
    getSongLastScheduledItemMock.mockResolvedValue({
      data: {
        id: "item-1",
        type: "Item",
        attributes: {
          title: "Build My Life",
          item_type: "song",
          sequence: 1,
          service_position: "during",
        },
        relationships: {
          arrangement: { data: { type: "Arrangement", id: "arr-1" } },
          key: { data: { type: "Key", id: "key-1" } },
          selected_layout: { data: { type: "Layout", id: "layout-1" } },
        },
      },
      included: [
        {
          id: "arr-1",
          type: "Arrangement",
          attributes: { name: "Default", sequence: ["Verse 1"], length: 240 },
        },
        {
          id: "key-1",
          type: "Key",
          attributes: { name: "G", starting_key: "G", ending_key: "G" },
        },
      ],
    });

    const options = await getSongOptions("song-1", "service-1", songsReader);

    expect(options.suggestedArrangementId).toBe("arr-1");
    expect(options.suggestedKeyId).toBe("key-1");
    expect(options.currentLayout).toStrictEqual({
      id: "layout-1",
      name: "Selected layout",
    });
    expect(options.layoutMode).toBe("existing-only");
  });

  it("falls back to the first non-archived arrangement and key", async () => {
    const {
      getSongMock,
      getSongArrangementsWithKeysMock,
      getSongLastScheduledItemMock,
      songsReader,
    } = createFixture();
    getSongMock.mockResolvedValue({
      id: "song-2",
      type: "Song",
      attributes: {
        title: "King of Kings",
      },
    });
    getSongArrangementsWithKeysMock.mockResolvedValue({
      data: [
        {
          id: "arr-archived",
          type: "Arrangement",
          attributes: { name: "Old", archived_at: "2024-01-01T00:00:00Z" },
        },
        {
          id: "arr-active",
          type: "Arrangement",
          attributes: { name: "Current", sequence: ["Verse 1"] },
        },
      ],
      included: [
        {
          id: "key-active",
          type: "Key",
          attributes: { name: "A" },
          relationships: {
            arrangement: { data: { type: "Arrangement", id: "arr-active" } },
          },
        },
      ],
    });
    getSongLastScheduledItemMock.mockResolvedValue({
      data: null,
      included: [],
    });

    const options = await getSongOptions("song-2", "service-1", songsReader);

    expect(options.suggestedArrangementId).toBe("arr-active");
    expect(options.suggestedKeyId).toBe("key-active");
    expect(options.layoutMode).toBe("unavailable");
  });

  it("builds key labels from starting and ending keys when the name is blank", async () => {
    const {
      getSongMock,
      getSongArrangementsWithKeysMock,
      getSongLastScheduledItemMock,
      songsReader,
    } = createFixture();
    getSongMock.mockResolvedValue({
      id: "song-3",
      type: "Song",
      attributes: {
        title: "Living Hope",
      },
    });
    getSongArrangementsWithKeysMock.mockResolvedValue({
      data: [
        {
          id: "arr-1",
          type: "Arrangement",
          attributes: { name: "Default" },
        },
      ],
      included: [
        {
          id: "key-1",
          type: "Key",
          attributes: { name: "", starting_key: "E", ending_key: "F#" },
          relationships: {
            arrangement: { data: { type: "Arrangement", id: "arr-1" } },
          },
        },
      ],
    });
    getSongLastScheduledItemMock.mockResolvedValue({
      data: null,
      included: [],
    });

    const options = await getSongOptions("song-3", "service-1", songsReader);

    expect(options.arrangements[0]?.keys[0]).toMatchObject({
      id: "key-1",
      name: "E -> F#",
      startingKey: "E",
      endingKey: "F#",
    });
  });
});
