import type { PlanPersonNotification } from "@pcobooster/planning-center-models/types";
import { Mail } from "lucide-react";

import { HoverLabel } from "@/components/ui/hover-card";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { describeSchedulingNotification } from "@/lib/schedule/scheduling-notifications";
import { cn } from "@/lib/utils";

const NOT_NOTIFIED_LABEL = "Not notified yet";

/**
 * Planning Center marks an unsent scheduling email with an envelope beside the person, so we
 * use the same one.
 */
export const UnsentNotificationMark = ({
  className,
}: {
  className?: string;
}) => (
  <HoverLabel
    label={NOT_NOTIFIED_LABEL}
    render={
      <span
        className={cn(
          "text-muted-foreground inline-flex shrink-0 items-center",
          className
        )}
      />
    }
  >
    <Mail className="size-3.5" aria-hidden />
    <span className="sr-only">{NOT_NOTIFIED_LABEL}</span>
  </HoverLabel>
);

export const SchedulingNotificationNote = ({
  notification,
  className,
}: {
  notification: PlanPersonNotification | null;
  className?: string;
}) => {
  const orgTimeZone = useOrganizationTimeZone();
  const description = describeSchedulingNotification(notification, orgTimeZone);
  if (description === null) {
    return null;
  }
  return (
    <p
      className={cn(
        "text-muted-foreground flex items-start gap-2 text-xs",
        className
      )}
    >
      <Mail className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{description}</span>
    </p>
  );
};
