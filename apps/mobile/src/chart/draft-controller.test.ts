import { chordChartSongOutputSchema } from "@pcobooster/contracts/chord-charts";
import type {
  ChordChartArrangement,
  ChordChartUpdateInput,
} from "@pcobooster/contracts/chord-charts";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import fixture from "../fixtures/chordCharts.song.json";
import { createChartDraftController } from "./draft-controller";
import type { ChartDraftDependencies } from "./draft-controller";

const makeHarness = (canEdit = true, autosaveKey?: string) => {
  const song = Schema.decodeUnknownSync(chordChartSongOutputSchema)(
    fixture.default
  );
  const [original] = song.arrangements;
  if (original === undefined) {
    throw new Error("The chart fixture needs an arrangement");
  }
  const arrangement = { ...original, updatedAt: "2026-10-05T10:00:00Z" };
  const records = new Map<string, string>();
  // Device storage and provider operations settle asynchronously like their native adapters.
  const storage = {
    getItem: vi.fn<ChartDraftDependencies["storage"]["getItem"]>(
      async (key) => {
        await Promise.resolve();
        return records.get(key) ?? null;
      }
    ),
    setItem: vi.fn<ChartDraftDependencies["storage"]["setItem"]>(
      async (key, value) => {
        await Promise.resolve();
        records.set(key, value);
      }
    ),
    removeItem: vi.fn<ChartDraftDependencies["storage"]["removeItem"]>(
      async (key) => {
        await Promise.resolve();
        records.delete(key);
      }
    ),
  };
  const update = vi.fn<ChartDraftDependencies["update"]>(async (input) => {
    await Promise.resolve();
    return {
      ...arrangement,
      chordChart: input.chordChart,
      updatedAt: "2026-10-05T10:01:00Z",
    };
  });
  const reload = vi
    .fn<ChartDraftDependencies["reload"]>()
    .mockResolvedValue(arrangement);
  const invalidate = vi
    .fn<ChartDraftDependencies["invalidate"]>()
    .mockResolvedValue();
  const dependencies: ChartDraftDependencies = {
    storage,
    update,
    reload,
    invalidate,
  };
  if (autosaveKey !== undefined) {
    dependencies.autosaveKey = autosaveKey;
  }
  const controller = createChartDraftController(
    song.song.id,
    arrangement,
    "account-a.song-5501.arrangement-55011",
    canEdit,
    dependencies
  );
  return {
    controller,
    records,
    storage,
    update,
    reload,
    invalidate,
    arrangement,
  };
};

const completedArrangement = (
  arrangement: ChordChartArrangement,
  input: ChordChartUpdateInput,
  updatedAt: string
): ChordChartArrangement => ({
  ...arrangement,
  chordChart: input.chordChart,
  updatedAt,
});

describe("native chart draft lifecycle", () => {
  it("saves an edit after an initial no-op save, and removes only the completed draft", async () => {
    const { controller, update, records } = makeHarness();
    await controller.restore();
    await controller.save();
    controller.edit({ text: "[G]First local edit" });
    await controller.save();
    expect(update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ chordChart: "[G]First local edit" })
    );
    expect(records.size).toBe(0);
    expect(controller.getSnapshot()).toMatchObject({
      status: "Saved",
      failure: null,
    });
  });

  it("serializes edits made during a save with the actual completed provider version", async () => {
    const { controller, update, arrangement, records } = makeHarness();
    const first = Promise.withResolvers<ChordChartArrangement>();
    update.mockReturnValueOnce(first.promise);
    await controller.restore();
    controller.edit({ text: "[G]First" });
    const firstSave = controller.save();
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    controller.edit({ text: "[C]Second", key: "C" });
    const secondSave = controller.save();
    expect(update).toHaveBeenCalledOnce();
    first.resolve({ ...arrangement, updatedAt: "provider-version-1" });
    await Promise.all([firstSave, secondSave]);
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        baseUpdatedAt: "provider-version-1",
        chordChart: "[C]Second",
        chordChartKey: "C",
      })
    );
    expect(records.size).toBe(0);
  });

  it("persists conflict edits and formatting, then restores their original comparison version", async () => {
    const first = makeHarness();
    first.update.mockRejectedValue(
      new Error("The chart was changed in Planning Center")
    );
    await first.controller.restore();
    first.controller.edit({
      text: "[D]Keep my local draft",
      key: "D",
      layout: {
        ...first.arrangement.layout,
        orientation: "Landscape",
        columns: 2,
      },
    });
    await expect(first.controller.save()).rejects.toThrow(
      "changed in Planning Center"
    );
    const [stored] = first.records.values();
    expect(stored).toBeDefined();
    const second = makeHarness();
    second.storage.getItem.mockResolvedValue(stored ?? null);
    await second.controller.restore();
    expect(second.controller.getSnapshot()).toMatchObject({
      restored: true,
      draft: {
        text: "[D]Keep my local draft",
        key: "D",
        layout: { orientation: "Landscape", columns: 2 },
      },
    });
    await second.controller.save();
    expect(second.update).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUpdatedAt: first.arrangement.updatedAt,
        layout: second.controller.getSnapshot().draft.layout,
      })
    );
  });

  it("preserves an explicit null comparison version in a restored device draft", async () => {
    const { controller, storage, arrangement, update } = makeHarness();
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        text: "[G]Restored",
        key: "G",
        layout: arrangement.layout,
        baseUpdatedAt: null,
      })
    );
    await controller.restore();
    await controller.save();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ baseUpdatedAt: null })
    );
  });

  it("keeps local edits available for copying after a failed retry", async () => {
    const { controller, update, records } = makeHarness();
    update.mockRejectedValue(new Error("Offline"));
    await controller.restore();
    controller.edit({ text: "[Em]Offline draft" });
    await controller.saveInBackground();
    controller.edit({ text: "[Em]Offline draft with more edits" });
    await controller.saveInBackground();
    expect(controller.getSnapshot()).toMatchObject({
      status: "Not saved",
      draft: { text: "[Em]Offline draft with more edits" },
    });
    expect([...records.values()]).toStrictEqual([
      expect.stringContaining("Offline draft with more edits"),
    ]);
  });

  it("waits for a failed in-flight write before explicitly reloading the provider chart", async () => {
    const { controller, update, reload, arrangement, records } = makeHarness();
    const pending = Promise.withResolvers<ChordChartArrangement>();
    update.mockReturnValueOnce(pending.promise);
    await controller.restore();
    controller.edit({ text: "Local edit" });
    const save = controller.saveInBackground();
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    const reloading = controller.reload();
    expect(reload).not.toHaveBeenCalled();
    pending.reject(new Error("Conflict"));
    await Promise.all([save, reloading]);
    expect(controller.getSnapshot()).toMatchObject({
      failure: null,
      status: "Saved",
      draft: { text: arrangement.chordChart },
    });
    expect(records.size).toBe(0);
  });

  it("does not duplicate a completed provider write when query refresh fails", async () => {
    const { controller, update, invalidate } = makeHarness();
    invalidate.mockRejectedValue(new Error("Cache refresh failed"));
    await controller.restore();
    controller.edit({ text: "Saved remotely" });
    await expect(controller.save()).rejects.toThrow("Cache refresh failed");
    expect(controller.getSnapshot().status).toBe("Saved");
    await controller.save();
    expect(update).toHaveBeenCalledOnce();
  });

  it("completes a committed save after the view unsubscribes", async () => {
    const { controller, update, arrangement, records } = makeHarness();
    const pending = Promise.withResolvers<ChordChartArrangement>();
    update.mockImplementationOnce(async (input) => {
      await pending.promise;
      return completedArrangement(
        arrangement,
        input,
        "completed-after-navigation"
      );
    });
    await controller.restore();
    const listener = vi.fn<() => void>();
    const unsubscribe = controller.subscribe(listener);
    controller.edit({ text: "Navigation draft" });
    const save = controller.save();
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    unsubscribe();
    listener.mockClear();
    pending.resolve(arrangement);
    await save;
    expect(listener).not.toHaveBeenCalled();
    expect(records.size).toBe(0);
    expect(controller.getSnapshot().status).toBe("Saved");
  });

  it("keeps mine against the latest provider version without adopting their chart", async () => {
    const { controller, update, reload, arrangement } = makeHarness();
    update.mockRejectedValueOnce(new Error("Conflict"));
    await controller.restore();
    controller.edit({
      text: "[C]My chart",
      key: "C",
      layout: { ...arrangement.layout, columns: 2 },
    });
    await controller.saveInBackground();
    reload.mockResolvedValue({
      ...arrangement,
      chordChart: "Their chart",
      updatedAt: "latest-provider-version",
    });
    await controller.keepMine();
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        chordChart: "[C]My chart",
        chordChartKey: "C",
        baseUpdatedAt: "latest-provider-version",
      })
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "Saved",
      failure: null,
      draft: { text: "[C]My chart", layout: { columns: 2 } },
    });
  });

  it("retains mine when someone edits again after the confirmed latest-version read", async () => {
    const { controller, update, reload, arrangement, records } = makeHarness();
    await controller.restore();
    controller.edit({ text: "Keep this local chart" });
    reload.mockResolvedValue({
      ...arrangement,
      updatedAt: "version-at-confirmation",
    });
    update.mockRejectedValue(new Error("A newer provider version exists"));
    await expect(controller.keepMine()).rejects.toThrow(
      "newer provider version"
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ baseUpdatedAt: "version-at-confirmation" })
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "Not saved",
      draft: { text: "Keep this local chart" },
    });
    expect([...records.values()]).toStrictEqual([
      expect.stringContaining("Keep this local chart"),
    ]);
  });

  it("undoes an imported replacement before autosave without sending a provider write", async () => {
    const { controller, update, arrangement } = makeHarness();
    await controller.restore();
    controller.replaceText("Imported lyrics");
    expect(controller.getSnapshot()).toMatchObject({
      status: "Unsaved",
      draft: { text: "Imported lyrics" },
      replaced: { text: arrangement.chordChart },
    });
    controller.undoReplacement();
    await controller.save();
    expect(controller.getSnapshot().draft.text).toBe(arrangement.chordChart);
    expect(update).not.toHaveBeenCalled();
    expect(controller.getSnapshot().replaced).toBeNull();
  });

  it("undoes an import that already autosaved using the completed provider version", async () => {
    const { controller, update, arrangement } = makeHarness();
    await controller.restore();
    controller.replaceText("Imported chart");
    await controller.save();
    controller.undoReplacement();
    await controller.save();
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        chordChart: arrangement.chordChart,
        baseUpdatedAt: "2026-10-05T10:01:00Z",
      })
    );
  });

  it("keeps subsequent manual edits when the imported text has since changed", async () => {
    const { controller } = makeHarness();
    await controller.restore();
    controller.replaceText("Imported text");
    controller.edit({ text: "My edit after importing" });
    controller.undoReplacement();
    expect(controller.getSnapshot().replaced).toBeNull();
    expect(controller.getSnapshot().draft.text).toBe("My edit after importing");
  });

  it("leaves a device draft untouched in view-only mode", async () => {
    const { controller, storage, update, arrangement } = makeHarness(false);
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        text: "Private draft",
        key: "G",
        layout: arrangement.layout,
      })
    );
    await controller.restore();
    controller.edit({ text: "Forbidden edit" });
    await controller.save();
    expect(controller.getSnapshot().draft.text).toBe(arrangement.chordChart);
    expect(update).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});

describe("chart autosave preference", () => {
  it("retains Save as you type OFF, saves device drafts, and only writes when manually saved", async () => {
    const first = makeHarness(true, "chart-autosave.account-a");
    await first.controller.restore();
    await first.controller.setAutosave(false);
    first.controller.edit({ text: "My unsaved chart" });
    // The debounce, blur, background, and unmount triggers all use this same gated path.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        await first.controller.autoSaveInBackground();
      })
    );
    expect({
      calls: first.update.mock.calls.length,
      preference: first.records.get("chart-autosave.account-a"),
    }).toStrictEqual({ calls: 0, preference: "false" });
    expect(
      first.records.get("account-a.song-5501.arrangement-55011")
    ).toContain("My unsaved chart");
    const returning = makeHarness(true, "chart-autosave.account-a");
    returning.storage.getItem.mockImplementation(async (key) => {
      await Promise.resolve();
      return first.records.get(key) ?? null;
    });
    await returning.controller.restore();
    expect(returning.controller.getSnapshot()).toMatchObject({
      autosave: false,
      restored: true,
      draft: { text: "My unsaved chart" },
    });
    await returning.controller.autoSaveInBackground();
    expect(returning.update).not.toHaveBeenCalled();
    await returning.controller.save();
    const otherAccount = makeHarness(true, "chart-autosave.account-b");
    await otherAccount.controller.restore();
    expect({
      calls: returning.update.mock.calls,
      status: returning.controller.getSnapshot().status,
      otherAutosave: otherAccount.controller.getSnapshot().autosave,
    }).toStrictEqual({
      calls: [[expect.objectContaining({ chordChart: "My unsaved chart" })]],
      status: "Saved",
      otherAutosave: true,
    });
  });

  it("enabling Save as you type resumes actual provider saves", async () => {
    const { controller, update } = makeHarness(
      true,
      "chart-autosave.account-a"
    );
    await controller.restore();
    await controller.setAutosave(false);
    controller.edit({ text: "Manual draft" });
    await controller.autoSaveInBackground();
    expect(update).not.toHaveBeenCalled();
    await controller.setAutosave(true);
    await controller.autoSaveInBackground();
    expect(update).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().status).toBe("Saved");
  });
});
