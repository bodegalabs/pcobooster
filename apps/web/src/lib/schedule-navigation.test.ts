import { describe, expect, it } from "vitest";

import {
  buildPlanMemberPositionId,
  planSlotLink,
  planWorkspaceLink,
} from "@/lib/schedule-navigation";

describe(planWorkspaceLink, () => {
  it("opens a plan on the assign view", () => {
    expect(planWorkspaceLink("78", "90")).toStrictEqual({
      to: "/services/$serviceTypeId/plans/$planId/$view",
      params: { serviceTypeId: "78", planId: "90", view: "assign" },
    });
  });
});

describe(planSlotLink, () => {
  it("selects a slot in a view", () => {
    expect(
      planSlotLink({
        serviceTypeId: "78",
        planId: "90",
        view: "lineup",
        teamId: "1",
        positionId: "2",
      })
    ).toStrictEqual({
      to: "/services/$serviceTypeId/plans/$planId/$view",
      params: { serviceTypeId: "78", planId: "90", view: "lineup" },
      search: { teamId: "1", positionId: "2" },
    });
  });

  it("omits an unselected slot from the URL", () => {
    expect(
      planSlotLink({
        serviceTypeId: "78",
        planId: "90",
        view: "assign",
        teamId: "",
        positionId: null,
      }).search
    ).toStrictEqual({ teamId: undefined, positionId: undefined });
  });
});

describe(buildPlanMemberPositionId, () => {
  it("normalizes the position name", () => {
    expect(buildPlanMemberPositionId("5", "  Lead Vocals ")).toBe(
      "plan-member-position:5:lead%20vocals"
    );
  });
});
