import { FEEDBACK_MESSAGE_MAX_LENGTH } from "@pcobooster/contracts/feedback";
/** Feedback a person sends from the app. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { integer } from "@pcobooster/contracts/http/schema";
import { Schema } from "effect";

const FEEDBACK_PATH_MAX_LENGTH = 2048;
const FEEDBACK_SESSION_ID_MAX_LENGTH = 128;

export const feedbackSubmitInputSchema = Schema.Struct({
  message: Schema.Trim.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(FEEDBACK_MESSAGE_MAX_LENGTH)
  ),
  /** The app route the user was on, used to reproduce the report. */
  path: Schema.String.check(
    Schema.isStartsWith("/"),
    Schema.isMaxLength(FEEDBACK_PATH_MAX_LENGTH)
  ),
  /** The browser's PostHog session, which links the report to its replay. */
  sessionId: Schema.NullOr(
    Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(FEEDBACK_SESSION_ID_MAX_LENGTH)
    )
  ),
});

export const feedbackSubmitOutputSchema = Schema.Struct({ id: integer });

export const feedback = plainGroup(
  "feedback",
  /** Writes the report to D1. */
  write.post("submit", "/feedback", {
    payload: feedbackSubmitInputSchema.fields,
    success: feedbackSubmitOutputSchema,
  })
);

export type FeedbackSubmitInput = typeof feedbackSubmitInputSchema.Type;
