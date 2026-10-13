import { describe, expect, it } from "vitest";

import {
  hasSeenGuide,
  parseOnboardingProgress,
  recordGuideSeen,
} from "@/lib/onboarding";

describe(hasSeenGuide, () => {
  it("shows the welcome until this account has seen it", () => {
    const seen = recordGuideSeen(null, "account-1", "welcome");

    expect(hasSeenGuide(null, "account-1", "welcome")).toBeFalsy();
    expect(hasSeenGuide(seen, "account-1", "welcome")).toBeTruthy();
    expect(hasSeenGuide(seen, "account-2", "welcome")).toBeFalsy();
  });

  it("keeps other accounts' progress when one records a guide", () => {
    const first = recordGuideSeen(null, "account-1", "welcome");
    const both = recordGuideSeen(first, "account-2", "welcome");

    expect(parseOnboardingProgress(both)).toStrictEqual({
      "account-1": ["welcome"],
      "account-2": ["welcome"],
    });
  });

  it("records a guide once however often it is seen", () => {
    const once = recordGuideSeen(null, "account-1", "welcome");

    expect(recordGuideSeen(once, "account-1", "welcome")).toBe(
      '{"account-1":["welcome"]}'
    );
  });
});

describe(parseOnboardingProgress, () => {
  it("treats unreadable storage as nothing seen", () => {
    expect(parseOnboardingProgress("{not json")).toStrictEqual({});
    expect(parseOnboardingProgress('{"account-1":"welcome"}')).toStrictEqual(
      {}
    );
  });
});
