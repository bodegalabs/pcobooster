import { describe, expect, it } from "vitest";

import { isPreviewStage, previewPullRequests } from "./stages";

describe(isPreviewStage, () => {
  it("accepts pull request stages", () => {
    expect(isPreviewStage("pr-12")).toBeTruthy();
  });

  it.each(["prod", "local", "migration", "pr-0", "pr-12-web", "pr-"])(
    "rejects %s",
    (stage) => {
      expect(isPreviewStage(stage)).toBeFalsy();
    }
  );
});

describe(previewPullRequests, () => {
  it("collects each pull request once from Workers and databases", () => {
    expect(
      previewPullRequests([
        "pcobooster-pr-140-api",
        "pcobooster-pr-140-web",
        "pcobooster-pr-140-admin",
        "pcobooster-pr-140",
        "pcobooster-pr-9-web",
      ])
    ).toStrictEqual([9, 140]);
  });

  it("ignores production, migration, and unrelated resources", () => {
    expect(
      previewPullRequests([
        "pcobooster-prod-web",
        "pcobooster-prod",
        "pcobooster-migration-api",
        "pcobooster-pr-12-worker",
        "other-pr-12-web",
        "alchemy-state-store",
      ])
    ).toStrictEqual([]);
  });
});
