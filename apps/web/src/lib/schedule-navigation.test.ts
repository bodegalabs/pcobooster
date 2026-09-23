import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildPlanWorkspaceUrl,
  updatePlanWorkspaceUrl,
} from "@/lib/schedule-navigation";

const pushState = vi.fn<History["pushState"]>();
const replaceState = vi.fn<History["replaceState"]>();

describe("schedule navigation", () => {
  beforeEach(() => {
    pushState.mockReset();
    replaceState.mockReset();
    vi.stubGlobal("window", { history: { pushState, replaceState } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe(buildPlanWorkspaceUrl, () => {
    it("opens a plan on the assign view", () => {
      expect(buildPlanWorkspaceUrl("78", "90")).toBe(
        "/services/78/plans/90/assign"
      );
    });
  });

  describe(updatePlanWorkspaceUrl, () => {
    it("pushes view and slot changes within the same plan in place", () => {
      const nextUrl = "/services/78/plans/90/lineup?teamId=1&positionId=2";

      expect(
        updatePlanWorkspaceUrl("/services/78/plans/90/assign", nextUrl, "push")
      ).toBeTruthy();
      expect(pushState).toHaveBeenCalledWith(null, "", nextUrl);
      expect(replaceState).not.toHaveBeenCalled();
    });

    it("replaces history when asked", () => {
      const nextUrl = "/services/78/plans/90/assign?teamId=1";

      expect(
        updatePlanWorkspaceUrl(
          "/services/78/plans/90/assign",
          nextUrl,
          "replace"
        )
      ).toBeTruthy();
      expect(replaceState).toHaveBeenCalledWith(null, "", nextUrl);
      expect(pushState).not.toHaveBeenCalled();
    });

    it("leaves other plans and pages to the router", () => {
      expect(
        updatePlanWorkspaceUrl(
          "/services/78/plans/90/assign",
          "/services/78/plans/91/assign",
          "push"
        )
      ).toBeFalsy();
      expect(
        updatePlanWorkspaceUrl(
          "/services",
          "/services/78/plans/90/assign",
          "push"
        )
      ).toBeFalsy();
      expect(
        updatePlanWorkspaceUrl(
          "/services/78/plans/90/assign",
          "/services",
          "push"
        )
      ).toBeFalsy();
      expect(pushState).not.toHaveBeenCalled();
    });
  });
});
