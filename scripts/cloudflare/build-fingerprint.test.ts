import { describe, expect, it } from "vitest";

import { buildFingerprint } from "./build-fingerprint";

const base = { PEOPLE_PAGE_ENABLED: "false" };

describe(buildFingerprint, () => {
  it("ignores runtime-only variables such as deploy credentials", () => {
    expect(
      buildFingerprint({
        ...base,
        BETTER_AUTH_SECRET: "secret",
        CLOUDFLARE_API_TOKEN: "token",
      })
    ).toBe(buildFingerprint(base));
  });

  it("treats unset and empty values alike", () => {
    expect(buildFingerprint({ ...base, DEV_AUTH_BYPASS: "" })).toBe(
      buildFingerprint(base)
    );
  });

  it.each([
    ["a build-time flag", { ...base, PEOPLE_PAGE_ENABLED: "true" }],
    ["a public variable", { ...base, NEXT_PUBLIC_POSTHOG_KEY: "phc_x" }],
  ])("changes when %s changes", (_label, environment) => {
    expect(buildFingerprint(environment)).not.toBe(buildFingerprint(base));
  });

  it("does not reveal values", () => {
    expect(
      buildFingerprint({ ...base, PRESENTATION_SEED: "seed-1" })
    ).not.toContain("seed-1");
  });
});
