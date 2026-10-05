import { afterEach, describe, expect, it, vi } from "vitest";

import { moveVisibleRunSheet, RunSheetDeletions } from "./run-sheet-deletions";

describe("native run sheet delete with Undo", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not send the provider deletion during the five-second Undo window", async () => {
    vi.useFakeTimers();
    const remove = vi.fn<(id: string) => Promise<void>>().mockResolvedValue();
    const deletions = new RunSheetDeletions(remove);
    deletions.queue({ id: "song-item", title: "Morning Light" });
    await vi.advanceTimersByTimeAsync(4999);
    expect(remove).not.toHaveBeenCalled();
    deletions.undo("song-item");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remove).not.toHaveBeenCalled();
    expect(deletions.getSnapshot()).toStrictEqual([]);
  });

  it("deletes exactly once after the window even if the view unsubscribes", async () => {
    vi.useFakeTimers();
    const remove = vi.fn<(id: string) => Promise<void>>().mockResolvedValue();
    const deletions = new RunSheetDeletions(remove);
    const listener = vi.fn<() => void>();
    const unsubscribe = deletions.subscribe(listener);
    deletions.queue({ id: "item", title: "Message" });
    deletions.queue({ id: "item", title: "Message" });
    unsubscribe();
    listener.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(remove).toHaveBeenCalledExactlyOnceWith("item");
    expect(listener).not.toHaveBeenCalled();
    expect(deletions.getSnapshot()).toStrictEqual([]);
  });

  it("restores a failed provider deletion with its error available for retry", async () => {
    vi.useFakeTimers();
    const remove = vi
      .fn<(id: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Planning Center unavailable"))
      .mockResolvedValue();
    const deletions = new RunSheetDeletions(remove);
    const item = { id: "item", title: "Message" };
    deletions.queue(item);
    await vi.advanceTimersByTimeAsync(5000);
    expect(deletions.getSnapshot()).toMatchObject([
      {
        id: "item",
        phase: "failed",
        failure: new Error("Planning Center unavailable"),
      },
    ]);
    deletions.queue(item);
    await vi.advanceTimersByTimeAsync(5000);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(deletions.getSnapshot()).toStrictEqual([]);
  });

  it("settles the Undo window before another write and moves against visible rows", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const providerItems = ["A", "B", "C"];
    const remove = vi.fn<(id: string) => Promise<void>>(async (id) => {
      await Promise.resolve();
      calls.push(`delete:${id}`);
      providerItems.splice(providerItems.indexOf(id), 1);
    });
    const deletions = new RunSheetDeletions(remove);
    deletions.queue({ id: "B", title: "Hidden item" });
    const sequence = moveVisibleRunSheet(
      providerItems,
      new Set(["B"]),
      "C",
      -1
    );
    await deletions.settle();
    calls.push("reorder");
    expect(sequence).toStrictEqual(["C", "A"]);
    expect(providerItems).toStrictEqual(["A", "C"]);
    expect(calls).toStrictEqual(["delete:B", "reorder"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remove).toHaveBeenCalledOnce();
    expect(deletions.getSnapshot()).toStrictEqual([]);
  });

  it("waits for an already committed delete and retains a failed delete before other writes", async () => {
    vi.useFakeTimers();
    const completion = Promise.withResolvers<null>();
    const remove = vi.fn<(id: string) => Promise<void>>(async () => {
      await completion.promise;
    });
    const deletions = new RunSheetDeletions(remove);
    deletions.queue({ id: "B", title: "Hidden item" });
    await vi.advanceTimersByTimeAsync(5000);
    let settled = false;
    const waiting = async (): Promise<void> => {
      await deletions.settle();
      settled = true;
    };
    const job = waiting();
    await Promise.resolve();
    expect(settled).toBeFalsy();
    completion.resolve(null);
    await job;
    expect(remove).toHaveBeenCalledOnce();
    remove.mockRejectedValueOnce(new Error("Provider refused"));
    deletions.queue({ id: "C", title: "Another item" });
    await expect(deletions.settle()).rejects.toThrow("Provider refused");
    expect(deletions.getSnapshot()).toMatchObject([
      { id: "C", phase: "failed" },
    ]);
  });
});
