import { describe, expect, it } from "vitest";

import { FIXTURE_ANCHOR_NOW } from "../harness/launch-options";
import {
  formatLastUsed,
  formatUsedAgo,
  mockDeviceAccounts,
} from "./device-accounts";

describe(formatLastUsed, () => {
  it("names recent uses the way the Swift sign-in screen does", () => {
    const [jordan, riley] = mockDeviceAccounts(FIXTURE_ANCHOR_NOW).map(
      (account) => formatLastUsed(account.lastUsedAt, FIXTURE_ANCHOR_NOW)
    );
    expect(jordan).toBe("2 hours ago");
    expect(riley).toBe("last week");
  });

  it("reads under an hour as just now", () => {
    expect(
      formatLastUsed(
        new Date(FIXTURE_ANCHOR_NOW.getTime() - 60_000),
        FIXTURE_ANCHOR_NOW
      )
    ).toBe("just now");
  });
});

describe(formatUsedAgo, () => {
  it("abbreviates how long ago the account was used", () => {
    const [jordan, riley] = mockDeviceAccounts(FIXTURE_ANCHOR_NOW).map(
      (account) => formatUsedAgo(account.lastUsedAt, FIXTURE_ANCHOR_NOW)
    );
    expect(jordan).toBe("Used today");
    expect(riley).toBe("Used 1w ago");
  });
});
