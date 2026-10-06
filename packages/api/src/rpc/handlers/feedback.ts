import { submitUserFeedback } from "@pcobooster/api/application/feedback";
import { feedbackRpc } from "@pcobooster/contracts/rpc/feedback";

export const FeedbackHandlers = feedbackRpc.toLayer({
  "feedback.submit": (input) => submitUserFeedback(input),
});
