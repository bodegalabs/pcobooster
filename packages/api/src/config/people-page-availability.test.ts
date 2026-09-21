import { describe, expect, it } from "vitest";

import { resolvePeoplePageAvailability } from "./people-page-availability";

describe(resolvePeoplePageAvailability, () => {
  it.each([
    ["true", true],
    ["false", false],
  ])("maps %s to %s", (configuredValue, expected) => {
    expect(resolvePeoplePageAvailability(configuredValue, false)).toBe(
      expected
    );
  });

  it("uses the environment fallback when no value is configured", () => {
    expect(resolvePeoplePageAvailability(undefined, true)).toBeTruthy();
    expect(resolvePeoplePageAvailability("", false)).toBeFalsy();
  });

  it("rejects ambiguous values", () => {
    expect(() => resolvePeoplePageAvailability("1", false)).toThrow(
      'PEOPLE_PAGE_ENABLED must be either "true" or "false"'
    );
  });
});
