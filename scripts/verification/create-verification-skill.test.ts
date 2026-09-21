import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createVerificationSkill } from "./create-verification-skill";

describe(createVerificationSkill, () => {
  it("creates a complete repo-local verification skill", () => {
    const outputRoot = mkdtempSync(path.join(tmpdir(), "verification-skill-"));
    const skillDirectory = createVerificationSkill({
      app: "Example app",
      launch: "bun run dev",
      name: "verify-example",
      outputRoot,
      url: "http://127.0.0.1:3000",
    });

    expect(
      readFileSync(path.join(skillDirectory, "SKILL.md"), "utf-8")
    ).toContain("name: verify-example");
    expect(
      readFileSync(
        path.join(skillDirectory, "references/feature-map.md"),
        "utf-8"
      )
    ).toContain("http://127.0.0.1:3000");
  });

  it("rejects ambiguous skill names", () => {
    expect(() =>
      createVerificationSkill({
        app: "Example app",
        launch: "bun run dev",
        name: "Verify Example",
        outputRoot: mkdtempSync(path.join(tmpdir(), "verification-skill-")),
        url: "http://127.0.0.1:3000",
      })
    ).toThrow("lowercase kebab-case");
  });
});
