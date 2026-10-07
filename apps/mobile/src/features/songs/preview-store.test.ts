import { describe, expect, it } from "vitest";

import { fixturePreviewStore } from "../../harness/fixture-preview-files";
import { makeMemoryPreviewStore } from "../../harness/testing/memory-preview-store";
import { guardPreviewStore } from "./preview-store";

const nativeController = () => {
  const controller = new AbortController();
  // React Native's signal implements abort events, but not this newer DOM method.
  Object.defineProperty(controller.signal, "throwIfAborted", {
    value: undefined,
  });
  Object.defineProperty(controller.signal, "reason", { value: undefined });
  return controller;
};

describe("native preview cancellation", () => {
  it("writes previews with a native signal without throwIfAborted", () => {
    const memory = makeMemoryPreviewStore();
    const { files } = guardPreviewStore(memory.store);
    const writer = files.begin("account-a", nativeController().signal);
    const uri = writer.writeBase64("chart", "Morning.pdf", "bytes");
    expect(memory.saved.get(uri)).toBe("bytes");
  });

  it("removes a late download after a native signal aborts", async () => {
    const pending = Promise.withResolvers<boolean>();
    const memory = makeMemoryPreviewStore({
      beforeSave: async () => {
        await pending.promise;
      },
    });
    const { files } = guardPreviewStore(memory.store);
    const controller = nativeController();
    const writer = files.begin("account-a", controller.signal);
    const download = writer.download(
      "chart",
      "Morning.pdf",
      new URL("https://files.example/chart.pdf")
    );
    controller.abort();
    pending.resolve(true);
    await expect(download).rejects.toMatchObject({ name: "AbortError" });
    expect(memory.downloads).toHaveLength(1);
    expect(memory.saved.size).toBe(0);
  });

  it("refuses a write after a native signal aborts", () => {
    const memory = makeMemoryPreviewStore();
    const { files } = guardPreviewStore(memory.store);
    const controller = nativeController();
    const writer = files.begin("account-a", controller.signal);
    controller.abort();
    expect(() => writer.writeBase64("chart", "Morning.pdf", "bytes")).toThrow(
      expect.objectContaining({ name: "AbortError" })
    );
    expect(memory.writes).toStrictEqual([]);
  });

  it("stores fixture documents and playable media without network downloads", async () => {
    const memory = makeMemoryPreviewStore();
    const fixture = fixturePreviewStore(memory.store);
    const { signal } = nativeController();
    const document = await fixture.download(
      "account-a",
      "file",
      "Notes.pdf",
      new URL("https://fixtures.invalid/attachments/88005"),
      signal
    );
    const audio = await fixture.playable(
      "account-a",
      "media",
      "Demo.mp3",
      new URL("https://fixtures.invalid/attachments/88001"),
      signal
    );
    expect(
      atob(memory.saved.get(document) ?? "").startsWith("%PDF-")
    ).toBeTruthy();
    expect(atob(memory.saved.get(audio) ?? "").startsWith("RIFF")).toBeTruthy();
    expect(audio.endsWith(".wav")).toBeTruthy();
    expect(memory.downloads).toStrictEqual([]);
  });

  it("refuses cancelled fixture documents and media before saving their bytes", async () => {
    const memory = makeMemoryPreviewStore();
    const fixture = fixturePreviewStore(memory.store);
    const controller = nativeController();
    controller.abort();
    await expect(
      fixture.download(
        "account-a",
        "file",
        "Notes.pdf",
        new URL("https://fixtures.invalid/88005"),
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      fixture.playable(
        "account-a",
        "media",
        "Demo.mp3",
        new URL("https://fixtures.invalid/88001"),
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(memory.writes).toStrictEqual([]);
  });
});
