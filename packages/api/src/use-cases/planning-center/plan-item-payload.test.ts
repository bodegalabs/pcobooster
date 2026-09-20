import type { getSongOptions } from "@worship-admin/api/use-cases/planning-center/get-song-options";
import {
  buildPlanItemAttributes,
  resolvePlanItemSongDefaults,
} from "@worship-admin/api/use-cases/planning-center/plan-item-payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSongOptionsMock = vi.fn<typeof getSongOptions>();

describe("plan item payload helpers", () => {
  beforeEach(() => {
    getSongOptionsMock.mockReset();
  });

  it("backfills song defaults and builds a trimmed payload", async () => {
    getSongOptionsMock.mockResolvedValue({
      song: {
        id: "song-1",
        title: "Build My Life",
        author: "Pat Barrett",
        themes: "Worship",
        hidden: false,
        lastScheduledAt: null,
      },
      arrangements: [],
      layouts: [],
      currentLayout: null,
      suggestedArrangementId: "arr-1",
      suggestedKeyId: "key-1",
      suggestedLayoutId: "layout-1",
      layoutMode: "existing-only",
    });

    const resolved = await resolvePlanItemSongDefaults(
      {
        serviceTypeId: "service-1",
        songId: "song-1",
        title: "  ",
        description: "  Spoken intro  ",
        htmlDetails: "  <p>Notes</p>  ",
        itemType: "item",
      },
      getSongOptionsMock
    );

    expect(resolved.title).toBe("Build My Life");
    expect(resolved.arrangementId).toBe("arr-1");
    expect(resolved.keyId).toBe("key-1");
    expect(resolved.selectedLayoutId).toBe("layout-1");

    expect(
      buildPlanItemAttributes(resolved, {
        defaultServicePosition: "during",
      })
    ).toStrictEqual({
      title: "Build My Life",
      service_position: "during",
      description: "Spoken intro",
      html_details: "<p>Notes</p>",
      song_id: "song-1",
      arrangement_id: "arr-1",
      key_id: "key-1",
      selected_layout_id: "layout-1",
    });
  });

  it("does not fetch song defaults when the client already supplied them", async () => {
    const resolved = await resolvePlanItemSongDefaults(
      {
        serviceTypeId: "service-1",
        songId: "song-1",
        title: "Build My Life",
        arrangementId: "arr-1",
        keyId: "key-1",
        selectedLayoutId: "layout-1",
      },
      getSongOptionsMock
    );

    expect(getSongOptionsMock).not.toHaveBeenCalled();
    expect(resolved).toMatchObject({
      title: "Build My Life",
      arrangementId: "arr-1",
      keyId: "key-1",
      selectedLayoutId: "layout-1",
    });
  });

  it("encodes header items explicitly and generic items implicitly", () => {
    expect(
      buildPlanItemAttributes({
        serviceTypeId: "service-1",
        title: "Welcome",
        itemType: "header",
      })
    ).toMatchObject({
      title: "Welcome",
      item_type: "header",
    });

    expect(
      buildPlanItemAttributes({
        serviceTypeId: "service-1",
        title: "Announcement",
        itemType: "item",
      })
    ).toStrictEqual({
      title: "Announcement",
    });
  });
});
