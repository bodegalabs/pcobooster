import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import { PlanningCenterNetworkError } from "@pcobooster/api/planning-center/network-error";
import { PlanningCenterReadOnlyError } from "@pcobooster/api/planning-center/read-only-error";
import {
  isRecoverablePlanningCenterCause,
  recoverPlanningCenterFailure,
} from "@pcobooster/api/planning-center/recover-failure";
import type { RecoverablePlanningCenterFailure } from "@pcobooster/api/planning-center/recover-failure";
import { PlanningCenterSubrequestLimitError } from "@pcobooster/api/planning-center/subrequest-limit-error";
import { planningCenterBudgetFailures } from "@pcobooster/api/testing/planning-center-failures";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

const ALL_KINDS: readonly RecoverablePlanningCenterFailure[] = [
  "not-found",
  "provider-failure",
  "unusable-response",
];

const recoverTo =
  (kinds: readonly RecoverablePlanningCenterFailure[]) =>
  async <Failure>(self: Effect.Effect<string, Failure>) =>
    await Effect.runPromiseExit(
      self.pipe(
        recoverPlanningCenterFailure({
          kinds,
          reason: "test fallback",
          fallback: () => "fallback",
        })
      )
    );

const budgetFailures = planningCenterBudgetFailures();

describe(recoverPlanningCenterFailure, () => {
  it.each(budgetFailures)(
    "propagates %s even when every kind is listed",
    async (failure) => {
      const exit = await recoverTo(ALL_KINDS)(Effect.fail(failure));

      expect(exit).toStrictEqual(Exit.fail(failure));
    }
  );

  it("propagates a budget failure alongside a recoverable one", async () => {
    const limit = new PlanningCenterSubrequestLimitError({
      source: "worker",
      requests: 50,
    });
    const cause = Cause.combine(
      Cause.fail(
        new PlanningCenterApiError({ message: "Not found", status: 404 })
      ),
      Cause.fail(limit)
    );
    const exit = await recoverTo(ALL_KINDS)(Effect.failCause(cause));

    expect(exit).toStrictEqual(Exit.failCause(cause));
  });

  it("propagates interruption", async () => {
    const exit = await recoverTo(ALL_KINDS)(Effect.interrupt);

    expect(
      Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
    ).toBeTruthy();
  });

  it("propagates read-only rejections", async () => {
    const error = new PlanningCenterReadOnlyError({
      method: "POST",
      path: "/services/v2/plans",
    });
    const exit = await recoverTo(ALL_KINDS)(Effect.fail(error));

    expect(exit).toStrictEqual(Exit.fail(error));
  });

  it("falls back after a listed 404", async () => {
    const exit = await recoverTo(["not-found"])(
      Effect.fail(
        new PlanningCenterApiError({ message: "Not found", status: 404 })
      )
    );

    expect(exit).toStrictEqual(Exit.succeed("fallback"));
  });

  it("propagates a provider failure that is not listed", async () => {
    const error = new PlanningCenterApiError({
      message: "Server error",
      status: 500,
    });
    const exit = await recoverTo(["not-found"])(Effect.fail(error));

    expect(exit).toStrictEqual(Exit.fail(error));
  });

  it("falls back after a network failure when provider failures are listed", async () => {
    const exit = await recoverTo(["provider-failure"])(
      Effect.fail(new PlanningCenterNetworkError({ cause: new Error("down") }))
    );

    expect(exit).toStrictEqual(Exit.succeed("fallback"));
  });

  it("recovers a defect only when unusable responses are listed", async () => {
    const defect = Effect.die(new Error("empty response"));

    await expect(
      recoverTo(["unusable-response"])(defect)
    ).resolves.toStrictEqual(Exit.succeed("fallback"));
    const unlisted = await recoverTo(["not-found", "provider-failure"])(defect);
    expect(
      Exit.isFailure(unlisted) && Cause.hasDies(unlisted.cause)
    ).toBeTruthy();
  });
});

describe(isRecoverablePlanningCenterCause, () => {
  it.each(budgetFailures)("never treats %s as recoverable", (failure) => {
    expect(
      isRecoverablePlanningCenterCause(Cause.fail(failure), ALL_KINDS)
    ).toBeFalsy();
  });

  it("accepts a listed provider failure", () => {
    expect(
      isRecoverablePlanningCenterCause(
        Cause.fail(new PlanningCenterApiError({ message: "Bad", status: 502 })),
        ["provider-failure"]
      )
    ).toBeTruthy();
  });
});
