import { describe, expect, it } from "vitest";

import {
  isPreviewStage,
  previewIdleLimitMs,
  previewStages,
  sweepDecision,
} from "./stages";

const at = (iso: string) => new Date(iso);

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

describe(previewStages, () => {
  it("groups Workers and databases by pull request at their latest change", () => {
    expect(
      previewStages([
        {
          name: "pcobooster-pr-140-api",
          changedAt: at("2026-09-20T00:00:00Z"),
        },
        {
          name: "pcobooster-pr-140-web",
          changedAt: at("2026-09-22T00:00:00Z"),
        },
        { name: "pcobooster-pr-140", changedAt: at("2026-09-01T00:00:00Z") },
        { name: "pcobooster-pr-9-web", changedAt: at("2026-09-10T00:00:00Z") },
      ])
    ).toStrictEqual([
      { pullRequest: 9, lastDeployedAt: at("2026-09-10T00:00:00Z") },
      { pullRequest: 140, lastDeployedAt: at("2026-09-22T00:00:00Z") },
    ]);
  });

  it("ignores production and unrelated resources", () => {
    expect(
      previewStages(
        [
          "pcobooster-prod-web",
          "pcobooster-prod",
          "pcobooster-migration-api",
          "pcobooster-pr-12-worker",
          "other-pr-12-web",
          "alchemy-state-store",
        ].map((name) => ({ name, changedAt: at("2026-09-01T00:00:00Z") }))
      )
    ).toStrictEqual([]);
  });
});

describe(sweepDecision, () => {
  const now = at("2026-09-23T00:00:00Z");
  const deployedAgo = (ms: number) => ({
    pullRequest: 1,
    lastDeployedAt: new Date(now.getTime() - ms),
  });

  it("destroys stages of closed pull requests regardless of age", () => {
    expect(sweepDecision(deployedAgo(0), false, now)).toBe("destroy-closed");
  });

  it("keeps an open pull request's recent stage", () => {
    expect(sweepDecision(deployedAgo(previewIdleLimitMs), true, now)).toBe(
      "keep"
    );
  });

  it("destroys an open pull request's stage once idle past the limit", () => {
    expect(sweepDecision(deployedAgo(previewIdleLimitMs + 1), true, now)).toBe(
      "destroy-idle"
    );
  });
});
