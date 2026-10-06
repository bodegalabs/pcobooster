/** Feedback a person sends from the app. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import {
  feedbackSubmitInputSchema,
  feedbackSubmitOutputSchema,
} from "@pcobooster/contracts/rpc/feedback";

export const feedback = plainGroup(
  "feedback",
  /** Writes the report to D1. */
  write.post("feedback.submit", "/feedback", {
    params: {},
    payload: feedbackSubmitInputSchema.fields,
    success: feedbackSubmitOutputSchema,
  })
);
