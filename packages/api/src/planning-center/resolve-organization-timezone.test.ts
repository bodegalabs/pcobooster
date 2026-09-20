import { resolveOrganizationTimeZone } from "@worship-admin/api/planning-center/resolve-organization-timezone";
import type { PCResource } from "@worship-admin/api/types";
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
      })
    ).resolves.toBe("America/Chicago");
    await expect(
      resolveOrganizationTimeZone({
        catalogService: secondCatalog,
        cacheScope: "effect-request-second",
      })
    ).resolves.toBe("America/New_York");
  });
});
