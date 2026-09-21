import { describe, expect, it } from "vitest";

import {
  artifactKindForPath,
  classifyChangedFiles,
  deriveVerdict,
  maxRiskTier,
  renderProofReport,
  requiresVisualEvidence,
  validateReceiptSemantics,
} from "./proof-core";
import type { ProofReceipt } from "./proof-core";

describe("proof classification", () => {
  it("uses the highest risk path in a change", () => {
    expect(
      classifyChangedFiles([
        "docs/ci-cd.md",
        "apps/web/src/components/button.tsx",
        "packages/api/src/auth/session.ts",
      ])
    ).toBe("critical");
  });

  it("requires visual proof only for changed visible surfaces", () => {
    expect(
      requiresVisualEvidence(["apps/web/src/components/button.tsx"])
    ).toBeTruthy();
    expect(
      requiresVisualEvidence(["apps/web/src/components/button.test.tsx"])
    ).toBeFalsy();
    expect(
      requiresVisualEvidence(["packages/api/src/auth/session.ts"])
    ).toBeFalsy();
    expect(
      requiresVisualEvidence(["apps/web/public/product-preview.png"])
    ).toBeTruthy();
    expect(
      requiresVisualEvidence(["apps/web/src/app/manifest.webmanifest"])
    ).toBeTruthy();
  });

  it("allows explicit risk only to raise automatic classification", () => {
    expect(maxRiskTier("high", "low")).toBe("high");
    expect(maxRiskTier("medium", "critical")).toBe("critical");
  });

  it("accepts only GitHub-renderable media", () => {
    expect(artifactKindForPath("proof.png")).toBe("image");
    expect(artifactKindForPath("walkthrough.mp4")).toBe("video");
    expect(() => artifactKindForPath("report.txt")).toThrow(
      "must be an image or video"
    );
  });
});

describe("proof report", () => {
  it("binds the report to revision identity and recorded checks", () => {
    const receipt: ProofReceipt = {
      artifacts: [],
      base: { ref: "origin/main", sha: "base" },
      changedFiles: ["docs/ci-cd.md"],
      commands: [
        {
          command: "bun run ci",
          durationMs: 42,
          exitCode: 0,
          logPath: "logs/ci.log",
          name: "ci",
          sha256: "a".repeat(64),
          status: "pass",
        },
      ],
      createdAt: "2026-09-21T20:00:00.000Z",
      flows: [],
      headSha: "head",
      independentVerification: null,
      notes: [],
      patchId: "patch",
      requiresVisualEvidence: false,
      riskTier: "low",
      rollback: null,
      schemaVersion: 1,
      verdict: "PASS",
    };

    const report = renderProofReport(receipt);
    expect(report).toContain("proofed-delivery:head");
    expect(report).toContain("stable patch `patch`");
    expect(report).toContain("| ci | pass | `bun run ci` | 42 ms |");
  });

  it("rejects contradictory or downgraded receipt claims", () => {
    const receipt: ProofReceipt = {
      artifacts: [],
      base: { ref: "origin/main", sha: "base" },
      changedFiles: ["docs/ci-cd.md"],
      commands: [
        {
          command: "bun run ci",
          durationMs: 42,
          exitCode: 1,
          logPath: "logs/ci.log",
          name: "ci",
          sha256: "a".repeat(64),
          status: "pass",
        },
      ],
      createdAt: "2026-09-21T20:00:00.000Z",
      flows: [],
      headSha: "head",
      independentVerification: null,
      notes: [],
      patchId: "patch",
      requiresVisualEvidence: false,
      riskTier: "low",
      rollback: null,
      schemaVersion: 1,
      verdict: "PASS",
    };

    expect(
      validateReceiptSemantics(receipt, {
        changedFiles: ["packages/api/src/auth/session.ts"],
        minimumRiskTier: "critical",
        requiresVisualEvidence: false,
      })
    ).toStrictEqual(
      expect.arrayContaining([
        "changed files do not match the proved revision",
        "risk tier is lower than the changed paths require",
        "ci status contradicts its exit code",
      ])
    );
  });

  it("blocks high-risk proof without an independent verifier", () => {
    expect(
      deriveVerdict({
        artifacts: [],
        commands: [
          {
            command: "bun run ci",
            durationMs: 42,
            exitCode: 0,
            logPath: "logs/ci.log",
            name: "ci",
            sha256: "a".repeat(64),
            status: "pass",
          },
        ],
        independentVerification: null,
        notes: [],
        requiresVisualEvidence: false,
        riskTier: "high",
        rollback: null,
      })
    ).toBe("BLOCKED");
  });
});
