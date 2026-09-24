import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import { z } from "zod";

export const FEEDBACK_MESSAGE_MAX_LENGTH = 5000;

export const feedbackSubmitInputSchema = z.object({
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX_LENGTH),
  /** The app route the user was on, used to reproduce the report. */
  path: z.string().startsWith("/").max(2048),
  /** The browser's PostHog session, which links the report to its replay. */
  sessionId: z.string().min(1).max(128).nullable(),
});
export const feedbackSubmitOutputSchema = z.object({ id: z.number().int() });

export const feedbackContract = {
  submit: oc
    .errors({
      UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
      FORBIDDEN: applicationErrorMap.FORBIDDEN,
      INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
    })
    .route({
      method: "POST",
      path: "/feedback",
      summary: "Send feedback from the signed-in user",
    })
    .input(feedbackSubmitInputSchema)
    .output(feedbackSubmitOutputSchema),
};

export type FeedbackSubmitInput = z.output<typeof feedbackSubmitInputSchema>;
