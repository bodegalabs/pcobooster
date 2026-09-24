import { resolveOrganizationTimeZone } from "@pcobooster/api/planning-center/resolve-organization-timezone";
import { testServerConfig } from "@pcobooster/api/testing/server";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

const organization = (timeZone: string): PCResource => ({
  type: "Organization",
  id: timeZone,
  attributes: { time_zone: timeZone },
});

describe(resolveOrganizationTimeZone, () => {
  it("uses the explicit service and cache scope for converted requests", async () => {
    const firstCatalog = {
      getOrganization: vi
        .fn<() => Promise<PCResource>>()
        .mockResolvedValue(organization("America/Chicago")),
    };
    const secondCatalog = {
      getOrganization: vi
        .fn<() => Promise<PCResource>>()
        .mockResolvedValue(organization("America/New_York")),
    };

    await expect(
      resolveOrganizationTimeZone({
        catalogService: firstCatalog,
        cacheScope: "effect-request-first",
        fallbackTimeZone: "America/Los_Angeles",
      })
    ).resolves.toBe("America/Chicago");
    await expect(
      resolveOrganizationTimeZone({
        catalogService: secondCatalog,
        cacheScope: "effect-request-second",
        fallbackTimeZone: "America/Los_Angeles",
      })
    ).resolves.toBe("America/New_York");
  });

  it.each([
    ["America/Denver", "America/Denver"],
    ["", "America/Los_Angeles"],
    [undefined, "America/Los_Angeles"],
  ])(
    "falls back to PLANNING_CENTER_TIME_ZONE=%j as %s without an org zone",
    async (configured, expected) => {
      const { fallbackTimeZone } = testServerConfig({
        PLANNING_CENTER_TIME_ZONE: configured,
      });
      const catalogService = {
        getOrganization: vi
          .fn<() => Promise<PCResource>>()
          .mockRejectedValue(new Error("unavailable")),
      };

      await expect(
        resolveOrganizationTimeZone({
          catalogService,
          cacheScope: `fallback-${String(configured)}`,
          fallbackTimeZone,
        })
      ).resolves.toBe(expected);
    }
  );
});
