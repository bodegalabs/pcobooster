import { BubbleChatEditIcon } from "@hugeicons/core-free-icons";
import { ORPCError } from "@orpc/client";
import { getAnalyticsSessionId } from "@pcobooster/analytics/client";
import { FEEDBACK_MESSAGE_MAX_LENGTH } from "@pcobooster/contracts/feedback";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { HotkeyChord } from "@/components/hotkey-chord";
import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAccountsQuery } from "@/hooks/use-account-panel";
import { orpc } from "@/orpc-client";

const SEND_FEEDBACK_HOTKEY = "Mod+Enter";
const SEND_FAILED_MESSAGE = "Couldn't send feedback. Try again.";
const messageErrorDataSchema = z.object({ message: z.string().min(1) });

/** Desktop sidebar entry point; the draft survives closing the popover. */
export const SidebarFeedback = () => {
  const { data } = useAccountsQuery();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const message = draft.trim();

  const [sending, setSending] = useState(false);
  const canSend = message.length > 0 && !sending;

  // Feedback touches no cached data, so a plain request replaces a mutation.
  const send = async () => {
    if (!canSend) {
      return;
    }
    setSending(true);
    try {
      await orpc.feedback.submit({
        message,
        path: window.location.pathname,
        sessionId: getAnalyticsSessionId(),
      });
      setSending(false);
      setDraft("");
      setOpen(false);
      toast.success("Thanks! Your feedback was sent.");
    } catch (error) {
      setSending(false);
      // Application errors carry a user-facing message in their data.
      const errorData =
        error instanceof ORPCError
          ? messageErrorDataSchema.safeParse(error.data)
          : null;
      toast.error(
        errorData?.success === true
          ? errorData.data.message
          : SEND_FAILED_MESSAGE
      );
    }
  };

  useHotkey(
    SEND_FEEDBACK_HOTKEY,
    () => {
      void send();
    },
    // Scoped by open state: the popup mounts after opening, so a ref target
    // would still be empty when the hotkey registers.
    { enabled: open, ignoreInputs: false }
  );

  if (data?.demo === true) {
    return null;
  }

  return (
    <SidebarMenuItem>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<SidebarMenuButton tooltip="Feedback" />}>
          <SidebarNavIcon icon={BubbleChatEditIcon} />
          <span>Feedback</span>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="end"
          sideOffset={12}
          className="w-80"
        >
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="flex flex-col gap-1">
              <PopoverTitle>Send feedback</PopoverTitle>
              <PopoverDescription>
                Found a bug or something confusing? Tell us what happened.
              </PopoverDescription>
            </div>
            <Textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              aria-label="Feedback"
              placeholder="What happened?"
              maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
              className="max-h-64 min-h-28"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <HotkeyChord id="feedback.send" binding={SEND_FEEDBACK_HOTKEY} />
              <Button type="submit" size="sm" disabled={!canSend}>
                {sending ? <Spinner /> : null}
                Send
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
};
