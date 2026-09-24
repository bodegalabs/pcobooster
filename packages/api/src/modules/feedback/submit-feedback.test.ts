import { submitFeedback } from "@pcobooster/api/modules/feedback/submit-feedback";
import type {
  FeedbackDependencies,
  FeedbackSubmission,
} from "@pcobooster/api/modules/feedback/submit-feedback";
import { describe, expect, it, vi } from "vitest";

const submission: FeedbackSubmission = {
  userId: "user-1",
  message: "Assigning a vocalist shows the wrong position.",
  path: "/services/st-1/plans/plan-1/assign",
  sessionId: "session-1",
  userAgent: "Mozilla/5.0",
};

const person = {
  email: "ada@example.com",
  name: "Ada",
  organizationId: "org-1",
  organizationName: "Grace Church",
};

const dependencies = (
  overrides: Partial<FeedbackDependencies> = {}
): FeedbackDependencies => ({
  save: vi.fn<FeedbackDependencies["save"]>().mockResolvedValue({ id: 7 }),
  loadPerson: vi
    .fn<FeedbackDependencies["loadPerson"]>()
    .mockResolvedValue(person),
  forward: vi
    .fn<NonNullable<FeedbackDependencies["forward"]>>()
    .mockResolvedValue(),
  onForwardFailure: vi.fn<FeedbackDependencies["onForwardFailure"]>(),
  ...overrides,
});

describe(submitFeedback, () => {
  it("saves the feedback and forwards it with the person profile", async () => {
    const deps = dependencies();
    await expect(submitFeedback(submission, deps)).resolves.toStrictEqual({
      id: 7,
    });
    expect(deps.save).toHaveBeenCalledWith(submission);
    expect(deps.forward).toHaveBeenCalledWith(
      {
        id: 7,
        userId: "user-1",
        message: submission.message,
        path: submission.path,
        sessionId: "session-1",
      },
      person
    );
  });

  it("keeps saved feedback when PostHog delivery fails", async () => {
    const failure = new Error("PostHog capture failed with status 500");
    const deps = dependencies({
      forward: vi
        .fn<NonNullable<FeedbackDependencies["forward"]>>()
        .mockRejectedValue(failure),
    });
    await expect(submitFeedback(submission, deps)).resolves.toStrictEqual({
      id: 7,
    });
    expect(deps.onForwardFailure).toHaveBeenCalledWith(failure, 7);
  });

  it("stays in the database when forwarding is disabled", async () => {
    const deps = dependencies({ forward: null });
    await submitFeedback(submission, deps);
    expect(deps.loadPerson).not.toHaveBeenCalled();
  });

  it("rejects when the database write fails", async () => {
    const deps = dependencies({
      save: vi
        .fn<FeedbackDependencies["save"]>()
        .mockRejectedValue(new Error("connection refused")),
    });
    await expect(submitFeedback(submission, deps)).rejects.toThrow(
      "connection refused"
    );
    expect(deps.forward).not.toHaveBeenCalled();
  });
});
