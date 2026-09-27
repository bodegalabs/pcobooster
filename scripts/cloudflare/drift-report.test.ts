import { describe, expect, it } from "vitest";

import { driftReport } from "./drift-report";

const resource = (fqn: string, status: "in-sync" | "drifted" | "missing") => ({
  fqn,
  logicalId: fqn,
  resourceType: "Cloudflare.Worker",
  status,
});

describe(driftReport, () => {
  it("passes when every resource is in sync", () => {
    const report = driftReport("alchemy.run.ts", "prod", [
      resource("Api", "in-sync"),
      resource("Web", "in-sync"),
    ]);
    expect(report.drifted).toBeFalsy();
    expect(report.markdown).toContain("All 2 resources match");
  });

  it("lists drifted and missing resources in name order", () => {
    const report = driftReport("alchemy.run.ts", "prod", [
      resource("Web", "drifted"),
      resource("Api", "in-sync"),
      resource("Admin", "missing"),
    ]);
    expect(report.drifted).toBeTruthy();
    expect(report.markdown).toContain("2 of 3 resources differ");
    expect(report.markdown.indexOf("`Admin`")).toBeLessThan(
      report.markdown.indexOf("`Web`")
    );
    expect(report.markdown).not.toContain("`Api`");
  });
});
