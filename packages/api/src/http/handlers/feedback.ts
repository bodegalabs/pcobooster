import { submitUserFeedback } from "@pcobooster/api/application/feedback";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const FeedbackHandlers = HttpApiBuilder.group(
  ProductApi,
  "feedback",
  (handlers) =>
    handlers.handle("submit", ({ payload }) => submitUserFeedback(payload))
);
