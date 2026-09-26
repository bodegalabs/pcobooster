import type { LucideIcon } from "lucide-react";
import {
  Flame,
  MailQuestionMark,
  MoonStar,
  ThumbsDown,
  TrendingDown,
} from "lucide-react";

import type { CheckInReason } from "@/lib/team-health";
import { cn } from "@/lib/utils";

const reasonIcon: Record<CheckInReason["kind"], LucideIcon> = {
  unanswered: MailQuestionMark,
  declining: ThumbsDown,
  drifting: TrendingDown,
  overloaded: Flame,
  "not-serving": MoonStar,
};

/** Status tone per reason: waiting is amber, strain is red, fading is blue. */
const reasonTone: Record<CheckInReason["kind"], string> = {
  unanswered: "text-status-scheduled",
  declining: "text-status-declined",
  drifting: "text-status-info",
  overloaded: "text-status-declined",
  "not-serving": "text-muted-foreground",
};

/** The icon for a check-in reason, tinted by how it reads at a glance. */
export const CheckInReasonIcon = ({
  kind,
  className,
}: {
  kind: CheckInReason["kind"];
  className?: string;
}) => {
  const Icon = reasonIcon[kind];
  return (
    <Icon
      aria-hidden
      data-icon="inline-start"
      className={cn(reasonTone[kind], className)}
    />
  );
};
