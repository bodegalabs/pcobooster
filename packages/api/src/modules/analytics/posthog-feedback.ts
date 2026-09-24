import {
  createPostHogCaptureSender,
  toPostHogPersonSet,
} from "@pcobooster/api/modules/analytics/posthog-capture";
import type {
  PostHogCaptureBody,
  PostHogPersonProperties,
  PostHogPersonSet,
} from "@pcobooster/api/modules/analytics/posthog-capture";

const PERSON_PATH = /^\/people\/[^/]+/u;

export interface SubmittedFeedback {
  readonly id: number;
  readonly userId: string;
  readonly message: string;
  readonly path: string;
  readonly sessionId: string | null;
}

interface PostHogFeedbackProperties {
  readonly source: "server";
  readonly feedback_id: number;
  readonly message: string;
  readonly path: string;
  $session_id?: string;
  $set?: PostHogPersonSet;
}

/**
 * The user wrote the message for us, so it travels as-is. Planning Center
 * person IDs stay in the database, matching the server activity events.
 */
export const toPostHogFeedbackCapture = (
  apiKey: string,
  feedback: SubmittedFeedback,
  person: PostHogPersonProperties | null,
  now: Date
): PostHogCaptureBody => {
  const properties: PostHogFeedbackProperties = {
    source: "server",
    feedback_id: feedback.id,
    message: feedback.message,
    path: feedback.path.replace(PERSON_PATH, "/people/:personId"),
  };
  if (feedback.sessionId !== null) {
    // PostHog links events carrying the browser session ID to its replay.
    properties.$session_id = feedback.sessionId;
  }
  if (person !== null) {
    properties.$set = toPostHogPersonSet(person);
  }
  return {
    api_key: apiKey,
    event: "feedback submitted",
    distinct_id: feedback.userId,
    timestamp: now.toISOString(),
    properties,
  };
};

export type ForwardFeedback = (
  feedback: SubmittedFeedback,
  person: PostHogPersonProperties | null
) => Promise<void>;

export const createPostHogFeedbackForwarder = ({
  apiKey,
  fetch: send,
  now = () => new Date(),
}: {
  apiKey: string | undefined;
  fetch: typeof globalThis.fetch;
  now?: () => Date;
}): ForwardFeedback | null => {
  if (apiKey === undefined || apiKey === "") {
    return null;
  }
  const sendCapture = createPostHogCaptureSender(send);
  return async (feedback, person) => {
    await sendCapture(
      toPostHogFeedbackCapture(apiKey, feedback, person, now())
    );
  };
};
