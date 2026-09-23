import { describe, expect, it } from "vitest";

import {
  buildPlanViewUrl,
  getAppSection,
  parseDetailRoute,
  parsePlanRoute,
} from "@/lib/app-routes";

describe(parsePlanRoute, () => {
  it("reads the plan workspace path", () => {
    expect(parsePlanRoute("/services/12/plans/34/lineup")).toStrictEqual({
      serviceTypeId: "12",
      planId: "34",
      view: "lineup",
    });
  });

  it("rejects unknown views and other routes", () => {
    expect(parsePlanRoute("/services/12/plans/34/unknown")).toBeNull();
    expect(parsePlanRoute("/services")).toBeNull();
    expect(parsePlanRoute("/services/12/plans/34")).toBeNull();
  });
});

describe(buildPlanViewUrl, () => {
  it("keeps the slot query when switching views", () => {
    expect(
      buildPlanViewUrl(
        "/services/12/plans/34/assign",
        new URLSearchParams("teamId=1&positionId=2"),
        "times"
      )
    ).toBe("/services/12/plans/34/times?teamId=1&positionId=2");
  });

  it("falls back to services outside a plan", () => {
    expect(buildPlanViewUrl("/people", new URLSearchParams(), "plan")).toBe(
      "/services"
    );
  });
});

describe("app sections", () => {
  it("maps paths to their top-level section", () => {
    expect(getAppSection("/admin/users/1")).toBe("admin");
    expect(getAppSection("/people")).toBe("people");
    expect(getAppSection("/services/1/plans/2/assign")).toBe("services");
  });

  it("describes detail routes with their parent", () => {
    expect(parseDetailRoute("/people/99")).toStrictEqual({
      parentHref: "/people",
      parentLabel: "People",
      label: "Person",
    });
    expect(parseDetailRoute("/admin/users/5")?.parentHref).toBe("/admin");
    expect(parseDetailRoute("/people")).toBeNull();
  });
});
