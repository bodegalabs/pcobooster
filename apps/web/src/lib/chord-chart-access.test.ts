import type { PlanningCenterAccessSnapshot } from "@pcobooster/planning-center-models/access";
import { describe, expect, it } from "vitest";

import { chordChartEditAccess } from "@/lib/chord-chart-access";

const snapshot = (
  songLevel: "Viewer" | "Editor" | null,
  organizationAdministrator = false
): PlanningCenterAccessSnapshot => ({
  services: {
    status: "granted",
    organizationAdministrator,
    planLevel: "Editor",
    maxPlanLevel: "Editor",
    songLevel,
    canViewAllPeople: true,
    ledTeamCount: 0,
    serviceTypes: [],
  },
  people: { status: "granted" },
});

describe(chordChartEditAccess, () => {
  it("lets song Editors and organization administrators edit", () => {
    expect(chordChartEditAccess(snapshot("Editor"), false)).toStrictEqual({
      canEdit: true,
    });
    expect(chordChartEditAccess(snapshot("Viewer", true), false)).toStrictEqual(
      { canEdit: true }
    );
  });

  it("makes the editor view-only for song Viewers, with the reason", () => {
    expect(chordChartEditAccess(snapshot("Viewer"), false)).toStrictEqual({
      canEdit: false,
      reason:
        "Your song access in Planning Center is Viewer. Saving chord charts needs Editor.",
    });
  });

  it("leaves editing open while permissions load or the level is unknown", () => {
    expect(chordChartEditAccess(null, false)).toStrictEqual({ canEdit: true });
    expect(chordChartEditAccess(snapshot(null), false)).toStrictEqual({
      canEdit: true,
    });
  });

  it("makes the read-only demo view-only", () => {
    expect(chordChartEditAccess(snapshot("Editor"), true)).toMatchObject({
      canEdit: false,
    });
  });
});
