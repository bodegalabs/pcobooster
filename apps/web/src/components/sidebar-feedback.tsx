import { BubbleChatEditIcon } from "@hugeicons/core-free-icons";
import { FEEDBACK_MESSAGE_MAX_LENGTH } from "@pcobooster/contracts/feedback";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useState } from "react";

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
import { useFeedbackDraft } from "@/hooks/use-feedback-draft";

const SEND_FEEDBACK_HOTKEY = "Mod+Enter";

/** Desktop sidebar entry point; the draft survives closing the popover. */
export const SidebarFeedback = () => {
  const { data } = useAccountsQuery();
  const [open, setOpen] = useState(false);
  const { draft, setDraft, sending, canSend, send } = useFeedbackDraft({
    onSent: () => {
      setOpen(false);
    },
  });

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
    <SidebarMenuItem data-tour="feedback">
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
