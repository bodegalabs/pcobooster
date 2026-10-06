/** Feedback procedures over Effect RPC. Ported from the zod schemas in `../feedback.ts`. */
import { FEEDBACK_MESSAGE_MAX_LENGTH } from "@pcobooster/contracts/feedback";
import { plainGroup } from "@pcobooster/contracts/rpc/group";
import { write } from "@pcobooster/contracts/rpc/procedure";
import { integer } from "@pcobooster/contracts/rpc/schema";
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

/** Writes the report to D1. */
export const feedbackSubmit = write("feedback.submit", {
  payload: feedbackSubmitInputSchema,
  success: feedbackSubmitOutputSchema,
});

export const feedbackProcedures = [feedbackSubmit] as const;
export const feedbackRpc = plainGroup(...feedbackProcedures);
