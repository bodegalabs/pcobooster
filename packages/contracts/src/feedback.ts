import { RpcError } from "@pcobooster/contracts/errors";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const FEEDBACK_MESSAGE_MAX_LENGTH = 5000;

export const feedbackSubmitInputSchema = Schema.Struct({
  message: Schema.Trim.check(Schema.isMinLength(1)).check(
    Schema.isMaxLength(FEEDBACK_MESSAGE_MAX_LENGTH)
  ),
  /** The app route the user was on, used to reproduce the report. */
  path: Schema.String.check(Schema.isStartingWith("/")).check(
    Schema.isMaxLength(2048)
  ),
  /** The browser's PostHog session, which links the report to its replay. */
  sessionId: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(128))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const feedbackSubmitOutputSchema = Schema.Struct({
  id: Schema.Finite.check(Schema.isInt()),
}).mapFields(Struct.map(Schema.mutableKey));

export const feedbackRpc = RpcGroup.make(
  Rpc.make("feedback.submit", {
    payload: feedbackSubmitInputSchema,
    success: feedbackSubmitOutputSchema,
    error: RpcError,
  })
);

export type FeedbackSubmitInput = typeof feedbackSubmitInputSchema.Type;
