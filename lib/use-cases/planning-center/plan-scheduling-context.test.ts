import { describe, expect, it } from "vitest";

import type { PCResource, RawPlanPerson } from "@/lib/types";
import { buildPlanSchedulingContext } from "@/lib/use-cases/planning-center/plan-scheduling-context";

const team = (id: string, name: string): PCResource => ({
  type: "Team",
  id,
  attributes: { name },
});

const person = (id: string, firstName: string): PCResource => ({
  type: "Person",
  id,
  attributes: {
    first_name: firstName,
    last_name: "Person",
    photo_thumbnail_url: null,
  },
});

const planMember = (params: {
  id: string;
  personId: string;
  teamId: string;
  teamPositionName: string;
}): RawPlanPerson => ({
  type: "PlanPerson",
  id: params.id,
  attributes: {
    status: "U",
    created_at: "2026-05-22T12:00:00Z",
    team_position_name: params.teamPositionName,
  },
  relationships: {
    team: { data: { type: "Team", id: params.teamId } },
    person: { data: { type: "Person", id: params.personId } },
  },
});

describe("plan scheduling context", () => {
  it("preserves Planning Center position names that contain separators", () => {
    const context = buildPlanSchedulingContext({
      serviceTypeId: "st-1",
      planId: "plan-1",
      planTeamMembers: [
        planMember({
          id: "pp-1",
          personId: "person-1",
          teamId: "team-band",
          teamPositionName: "Electric Guitar - Lead",
        }),
      ],
      included: [team("team-band", "Band"), person("person-1", "Pat")],
    });

    const [entry] = context.rosterEntries;
    expect(entry?.teamId).toBe("team-band");
    expect(entry?.teamName).toBe("Band");
    expect(entry?.positionName).toBe("Electric Guitar - Lead");
    expect(entry?.label).toBe("Band - Electric Guitar - Lead");
    expect(
      context.rosterBySlotKey.get("team-band::electric guitar - lead")
    ).toHaveLength(1);
  });

  it("removes only the known team prefix when Planning Center returns a full team-position label", () => {
    const context = buildPlanSchedulingContext({
      serviceTypeId: "st-1",
      planId: "plan-1",
      planTeamMembers: [
        planMember({
          id: "pp-1",
          personId: "person-1",
          teamId: "team-band",
          teamPositionName: "Band - Vocals",
        }),
      ],
      included: [team("team-band", "Band"), person("person-1", "Pat")],
    });

    const [entry] = context.rosterEntries;
    expect(entry?.positionName).toBe("Vocals");
    expect(entry?.label).toBe("Band - Vocals");
    expect(context.rosterBySlotKey.get("team-band::vocals")).toHaveLength(1);
  });
});
