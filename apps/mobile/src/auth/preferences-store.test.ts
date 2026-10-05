import { describe, expect, it } from "vitest";

import { PreferencesStore } from "./preferences-store";

describe("Native preferences", () => {
  it("restores appearance and analytics after a new app process starts", async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: async (key: string) =>
        await Promise.resolve(data.get(key) ?? null),
      setItem: async (key: string, value: string) => {
        data.set(key, value);
        await Promise.resolve();
      },
    };
    const first = new PreferencesStore(storage);
    await first.update({ appearance: "Dark", analytics: true });
    const restarted = new PreferencesStore(storage);
    await restarted.restore();
    expect(restarted.getSnapshot()).toStrictEqual({
      appearance: "Dark",
      analytics: true,
    });
  });
});
