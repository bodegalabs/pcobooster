import { describe, expect, it } from "vitest";

import { replayMaskingConfig } from "./replay";
import { replayBlockSelector, replayMaskTextSelector } from "./replay-markers";
import { project } from "./reports";

describe("replay markers", () => {
  it("keeps client replay masking aligned with the PostHog project definition", () => {
    expect(replayMaskingConfig()).toStrictEqual(
      project.settings.session_recording_masking_config
    );
    expect(replayMaskingConfig().maskTextSelector).toBe(replayMaskTextSelector);
    expect(replayBlockSelector).not.toContain("svg");
    expect(replayBlockSelector).not.toMatch(/\bimg\b/u);
  });
});
