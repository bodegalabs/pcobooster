import type { PostHogPersonProperties } from "@pcobooster/api/modules/analytics/posthog-capture";
import type {
  ForwardFeedback,
  SubmittedFeedback,
} from "@pcobooster/api/modules/analytics/posthog-feedback";

export interface FeedbackSubmission {
  readonly userId: string;
  readonly message: string;
  readonly path: string;
  readonly sessionId: string | null;
  readonly userAgent: string | null;
}

export interface FeedbackDependencies {
  readonly save: (submission: FeedbackSubmission) => Promise<{ id: number }>;
  readonly loadPerson: (
    userId: string
  ) => Promise<PostHogPersonProperties | null>;
  /** Null outside production, where feedback stays in the database only. */
  readonly forward: ForwardFeedback | null;
  readonly onForwardFailure: (error: Error, feedbackId: number) => void;
}

/**
 * The database row is the durable record. PostHog delivery, which drives the
 * alert, is best effort so a PostHog outage never loses or rejects feedback.
 */
export const submitFeedback = async (
  submission: FeedbackSubmission,
  dependencies: FeedbackDependencies
): Promise<{ id: number }> => {
  const { id } = await dependencies.save(submission);
  if (dependencies.forward !== null) {
    const feedback: SubmittedFeedback = {
      id,
      userId: submission.userId,
      message: submission.message,
      path: submission.path,
      sessionId: submission.sessionId,
    };
    try {
      const person = await dependencies.loadPerson(submission.userId);
      await dependencies.forward(feedback, person);
    } catch (error) {
      dependencies.onForwardFailure(
        error instanceof Error
          ? error
          : new Error("Feedback delivery failed", { cause: error }),
        id
      );
    }
  }
  return { id };
};
