import { submitUserFeedback } from "@pcobooster/api/application/feedback";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";
import { applyPrivateNoStore } from "@pcobooster/api/transport/orpc/response-headers";

const submit = rpc.feedback.submit.handler(
  async ({ input, context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(
      applicationRuntime,
      submitUserFeedback(input),
      context,
      signal
    );
  }
);

export const feedbackRouter = { submit };
