import { describe, expect, it } from "vitest";

import { noLaunchOptions, parseLaunchOptions } from "./launch-options";

/** The options launch arguments `values` describe. */
const parse = (values: Readonly<Record<string, string>>) =>
  parseLaunchOptions((key) => values[key] ?? null);

describe(parseLaunchOptions, () => {
  it("reads the Swift app's flags", () => {
    expect(
      parse({
        PCOBMock: "YES",
        PCOBMockSession: "signedOut",
        PCOBMockLatency: "0",
        PCOBFeatures: "all",
        PCOBFixedNow: "YES",
        PCOBRoute: "/account",
        PCOBTab: "people",
        PCOBGallery: "NO",
      })
    ).toStrictEqual({
      mock: true,
      mockSession: "signedOut",
      mockLatencyMs: 0,
      features: "all",
      fixedNow: true,
      route: "/account",
      serviceTypeId: null,
      tab: "people",
      showsGallery: false,
    });
  });

  it("falls back to the defaults for missing or unknown values", () => {
    expect(parse({ PCOBMockSession: "guest", PCOBTab: "home" })).toStrictEqual(
      noLaunchOptions
    );
  });
});
