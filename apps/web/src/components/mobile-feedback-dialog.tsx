import { FEEDBACK_MESSAGE_MAX_LENGTH } from "@pcobooster/contracts/feedback";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useFeedbackDraft } from "@/hooks/use-feedback-draft";

/** The phone's way to send feedback, opened from the menu; the sidebar has its own. */
export const MobileFeedbackDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { draft, setDraft, sending, canSend, send } = useFeedbackDraft({
    onSent: () => {
      onOpenChange(false);
    },
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent desktopClassName="max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <ResponsiveDialogHeader className="text-left">
            <ResponsiveDialogTitle>Send feedback</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Found a bug or something confusing? Tell us what happened.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="max-md:px-4">
            <Textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              aria-label="Feedback"
              placeholder="What happened?"
              maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
              className="max-h-64 min-h-32"
            />
          </div>
          <ResponsiveDialogFooter>
            <Button type="submit" disabled={!canSend}>
              {sending ? <Spinner /> : null}
              Send
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};
