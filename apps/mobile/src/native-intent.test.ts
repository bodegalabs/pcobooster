import { describe, expect, it } from "vitest";

import { nativeIntentPath } from "./native-intent";

describe("Native routes", () => {
  it("restores every original plan section and keeps scheduling context", () => {
    for (const [route, segment] of [
      ["overview", "Overview"],
      ["lineup", "Lineup"],
      ["plan", "Plan"],
      ["times", "Times"],
    ]) {
      expect(
        nativeIntentPath(
          `pcobooster://services/1101/plans/881261004/${route}?teamId=11`
        )
      ).toBe(`/services/1101/plans/881261004?teamId=11&segment=${segment}`);
    }
    expect(
      nativeIntentPath("https://pcobooster.com/people/42?month=2026-10")
    ).toBe("/people/42?month=2026-10");
    expect(nativeIntentPath("https://pcobooster.com/app/demo/key")).toBe(
      "/demo/key"
    );
    expect(nativeIntentPath("pcobooster://demo/key")).toBe("/demo/key");
  });

  it("normalizes malformed and empty launch intents without throwing", () => {
    expect(nativeIntentPath("//")).toBe("/");
    expect(nativeIntentPath("https://%")).toBe("/");
    expect(nativeIntentPath("pcobooster-dev://")).toBe("/");
  });
});
