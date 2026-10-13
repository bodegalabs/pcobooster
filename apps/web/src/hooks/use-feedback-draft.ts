import { getAnalyticsSessionId } from "@pcobooster/analytics/client";
import { failureMessage } from "@pcobooster/client/product-client";
import { useState } from "react";
import { toast } from "sonner";

import { productClient } from "@/product-client";

const SEND_FAILED_MESSAGE = "Couldn't send feedback. Try again.";

/**
 * A feedback draft and its sending, shared by the sidebar popover and the phone dialog.
 * The draft survives closing either one; `onSent` closes it once the message is in.
 */
export const useFeedbackDraft = ({ onSent }: { onSent: () => void }) => {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const message = draft.trim();
  const canSend = message.length > 0 && !sending;

  // Feedback touches no cached data, so a plain request replaces a mutation.
  const send = async () => {
    if (!canSend) {
      return;
    }
    setSending(true);
    try {
      await productClient.run((api) =>
        api.feedback.submit({
          payload: {
            message,
            path: window.location.pathname,
            sessionId: getAnalyticsSessionId(),
          },
        })
      );
      setSending(false);
      setDraft("");
      onSent();
      toast.success("Thanks! Your feedback was sent.");
    } catch (error) {
      setSending(false);
      toast.error(
        error instanceof Error
          ? failureMessage(error, SEND_FAILED_MESSAGE)
          : SEND_FAILED_MESSAGE
      );
    }
  };

  return { draft, setDraft, sending, canSend, send };
};
