import { recoverUnlessInterrupted } from "@pcobooster/api/planning-center/recover-unless-interrupted";
import { PlanningCenterSubrequestLimitError } from "@pcobooster/api/planning-center/subrequest-limit-error";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

describe(recoverUnlessInterrupted, () => {
  it("falls back after a subrequest-limit failure", async () => {
    await expect(
      Effect.runPromise(
        Effect.fail(
          new PlanningCenterSubrequestLimitError({
            source: "worker",
            requests: 50,
          })
        ).pipe(recoverUnlessInterrupted(() => "fallback"))
      )
    ).resolves.toBe("fallback");
  });

  it("still stops on interruption", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.interrupt.pipe(recoverUnlessInterrupted(() => "fallback"))
    );
    expect(
      Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
    ).toBeTruthy();
  });
});
