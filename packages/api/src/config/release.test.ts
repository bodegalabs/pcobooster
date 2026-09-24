import { describe, expect, it } from "vitest";

import { resolveReleaseVersion } from "./release";

describe(resolveReleaseVersion, () => {
  it("reports the deployed commit", () => {
    expect(resolveReleaseVersion("b57ca91")).toBe("b57ca91");
  });

  it("labels unconfigured runtimes as development", () => {
    expect(resolveReleaseVersion()).toBe("development");
    expect(resolveReleaseVersion("")).toBe("development");
  });
});
