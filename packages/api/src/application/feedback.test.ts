import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import { submitUserFeedback } from "@pcobooster/api/application/feedback";
import type { SubmitFeedbackDependencies } from "@pcobooster/api/application/feedback";
import { Effect, Result } from "effect";
import { describe, expect, it, vi } from "vitest";

const request = new Request("https://pcobooster.com/api/rpc/feedback", {
  method: "POST",
  headers: { "user-agent": "Mozilla/5.0" },
});

const input = {
  message: "The times tab doesn't show my rehearsal.",
  path: "/services/st-1/plans/plan-1/times",
  sessionId: "session-1",
};

type FeedbackAuthor = Awaited<
  ReturnType<SubmitFeedbackDependencies["identify"]>
>;

const dependencies = (author: FeedbackAuthor): SubmitFeedbackDependencies => ({
  identify: vi
    .fn<SubmitFeedbackDependencies["identify"]>()
    .mockResolvedValue(author),
  save: vi
    .fn<SubmitFeedbackDependencies["save"]>()
    .mockResolvedValue({ id: 7 }),
  loadPerson: vi
    .fn<SubmitFeedbackDependencies["loadPerson"]>()
    .mockResolvedValue(null),
  forward: null,
  onForwardFailure: vi.fn<SubmitFeedbackDependencies["onForwardFailure"]>(),
});

const submit = async (deps: SubmitFeedbackDependencies) =>
  await Effect.runPromise(
    Effect.result(
      Effect.provideService(
        submitUserFeedback(input, deps),
        RequestContext,
        createRequestContext(request)
      )
    )
  );

describe(submitUserFeedback, () => {
  it("saves feedback from the signed-in user with their browser", async () => {
    const deps = dependencies({ kind: "user", userId: "user-1" });
    await expect(submit(deps)).resolves.toStrictEqual(
      Result.succeed({ id: 7 })
    );
    expect(deps.save).toHaveBeenCalledWith({
      userId: "user-1",
      message: input.message,
      path: input.path,
      sessionId: "session-1",
      userAgent: "Mozilla/5.0",
    });
  });

  it("requires a signed-in user", async () => {
    const deps = dependencies(null);
    const result = await submit(deps);
    expect(Result.getFailure(result)).toMatchObject({
      _tag: "Some",
      value: { _tag: "Unauthenticated" },
    });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("refuses read-only demo visitors", async () => {
    const deps = dependencies({ kind: "demo" });
    const result = await submit(deps);
    expect(Result.getFailure(result)).toMatchObject({
      _tag: "Some",
      value: { _tag: "Forbidden" },
    });
    expect(deps.save).not.toHaveBeenCalled();
  });
});
