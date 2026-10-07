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

export type FeedbackSubmitInput = z.output<typeof feedbackSubmitInputSchema>;
