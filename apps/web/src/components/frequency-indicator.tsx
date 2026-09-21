import { PLAN_HISTORY_HALF_RANGE_WEEKS } from "@worship-admin/planning-center-models/schedule-constants";
import type {
  ScheduleFrequency,
  FrequencyLevel,
} from "@worship-admin/planning-center-models/types";

import { cn } from "@/lib/utils";

interface FrequencyIndicatorProps {
  frequency: ScheduleFrequency;
  className?: string;
}
const colors = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-red-500",
};
const labels = {
  low: "Good to schedule",
  medium: "Served recently",
  high: "Served frequently",
};
const textColors = {
  low: "text-green-700",
  medium: "text-yellow-700",
  high: "text-red-700",
};

const getFrequencyLevel = (frequency: ScheduleFrequency): FrequencyLevel => {
  const { recentServedDays } = frequency;
  if (recentServedDays === 0) {
    return "low";
  }
  if (recentServedDays <= 2) {
    return "medium";
  }
  return "high";
};

export const FrequencyIndicator = ({
  frequency,
  className,
}: FrequencyIndicatorProps) => {
  const level = getFrequencyLevel(frequency);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("h-2 w-2 rounded-full", colors[level])} />
      <span className={cn("text-xs font-medium", textColors[level])}>
        {labels[level]}
      </span>
      <span className="text-muted-foreground text-xs">
        ({frequency.recentServedDays} in {PLAN_HISTORY_HALF_RANGE_WEEKS}w)
      </span>
    </div>
  );
};

export const FrequencyStats = ({
  frequency,
}: {
  frequency: ScheduleFrequency;
}) => (
  <div className="grid grid-cols-3 gap-2 text-center text-xs">
    <div>
      <div className="font-semibold">{frequency.recentServedDays}</div>
      <div className="text-muted-foreground">
        {PLAN_HISTORY_HALF_RANGE_WEEKS}w
      </div>
    </div>
    <div>
      <div className="font-semibold">{frequency.last60Days}</div>
      <div className="text-muted-foreground">60d</div>
    </div>
    <div>
      <div className="font-semibold">{frequency.last90Days}</div>
      <div className="text-muted-foreground">90d</div>
    </div>
  </div>
);
