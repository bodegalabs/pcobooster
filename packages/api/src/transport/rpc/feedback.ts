import { submitUserFeedback } from "@pcobooster/api/application/feedback";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import { applyPrivateNoStore } from "@pcobooster/api/transport/rpc/response-headers";

const submit = defineHandler(
  "feedback.submit",
  async ({ input, context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(
      submitUserFeedback(input),
      context,
      signal
    );
  }
);

export const feedbackRouter = { submit };
