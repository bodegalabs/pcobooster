import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterNetworkError } from "@pcobooster/api/planning-center/network-error";
import { resolveOrganizationTimeZone } from "@pcobooster/api/planning-center/resolve-organization-timezone";
import { planningCenterBudgetFailures } from "@pcobooster/api/testing/planning-center-failures";
import { testServerConfig } from "@pcobooster/api/testing/server";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

type GetOrganization = () => Effect.Effect<PCResource, PlanningCenterError>;

const organization = (timeZone: string): PCResource => ({
  type: "Organization",
  id: timeZone,
  attributes: { time_zone: timeZone },
});

describe(resolveOrganizationTimeZone, () => {
  it("uses the explicit service and cache scope for converted requests", async () => {
    const firstCatalog = {
      getOrganization: vi
        .fn<GetOrganization>()
        .mockReturnValue(Effect.succeed(organization("America/Chicago"))),
    };
    const secondCatalog = {
      getOrganization: vi
        .fn<GetOrganization>()
        .mockReturnValue(Effect.succeed(organization("America/New_York"))),
    };

    await expect(
      Effect.runPromise(
        resolveOrganizationTimeZone({
          catalogService: firstCatalog,
          cacheScope: "effect-request-first",
          fallbackTimeZone: "America/Los_Angeles",
        })
      )
    ).resolves.toBe("America/Chicago");
    await expect(
      Effect.runPromise(
        resolveOrganizationTimeZone({
          catalogService: secondCatalog,
          cacheScope: "effect-request-second",
          fallbackTimeZone: "America/Los_Angeles",
        })
      )
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
          .fn<GetOrganization>()
          .mockReturnValue(
            Effect.fail(
              new PlanningCenterNetworkError({ cause: new Error("offline") })
            )
          ),
      };

      await expect(
        Effect.runPromise(
          resolveOrganizationTimeZone({
            catalogService,
            cacheScope: `fallback-${String(configured)}`,
            fallbackTimeZone,
          })
        )
      ).resolves.toBe(expected);
    }
  );

  it.each(planningCenterBudgetFailures())(
    "fails with %s instead of caching the configured zone",
    async (failure) => {
      const getOrganization = vi
        .fn<GetOrganization>()
        .mockReturnValueOnce(Effect.fail(failure))
        .mockReturnValueOnce(Effect.succeed(organization("America/Chicago")));
      const dependencies = {
        catalogService: { getOrganization },
        cacheScope: `budget-${failure._tag}-${crypto.randomUUID()}`,
        fallbackTimeZone: "America/Los_Angeles",
      };

      await expect(
        Effect.runPromiseExit(resolveOrganizationTimeZone(dependencies))
      ).resolves.toStrictEqual(Exit.fail(failure));
      await expect(
        Effect.runPromise(resolveOrganizationTimeZone(dependencies))
      ).resolves.toBe("America/Chicago");
    }
  );

  it("stops when interrupted", async () => {
    const exit = await Effect.runPromiseExit(
      resolveOrganizationTimeZone({
        catalogService: {
          getOrganization: vi
            .fn<GetOrganization>()
            .mockReturnValue(Effect.interrupt),
        },
        cacheScope: `interrupted-${crypto.randomUUID()}`,
        fallbackTimeZone: "America/Los_Angeles",
      })
    );

    expect(
      Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
    ).toBeTruthy();
  });

  it("falls back when the organization response is unusable", async () => {
    const catalogService = {
      getOrganization: vi
        .fn<GetOrganization>()
        .mockReturnValue(Effect.die(new Error("empty organization"))),
    };

    await expect(
      Effect.runPromise(
        resolveOrganizationTimeZone({
          catalogService,
          cacheScope: "fallback-defect",
          fallbackTimeZone: "America/Phoenix",
        })
      )
    ).resolves.toBe("America/Phoenix");
  });
});
