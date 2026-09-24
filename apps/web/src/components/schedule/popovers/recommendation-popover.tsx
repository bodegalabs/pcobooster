import type { ReactElement } from "react";

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";

interface RecommendationPopoverProps {
  reasoning: string[] | undefined;
  personId: string;
  children: ReactElement;
}

export const RecommendationPopover = ({
  reasoning,
  personId,
  children,
}: RecommendationPopoverProps) => (
  <ResponsivePopover>
    <ResponsivePopoverTrigger render={children} />
    <ResponsivePopoverContent
      title="Why this ranking"
      align="end"
      sideOffset={6}
      className="w-80"
    >
      <div className="p-3">
        <p className="text-foreground text-sm font-semibold tracking-tight">
          Why this ranking
        </p>
        {reasoning?.length !== undefined &&
        reasoning?.length !== 0 &&
        !Number.isNaN(reasoning?.length) ? (
          <div className="mt-3 flex flex-col gap-2">
            {reasoning.map((reason) => (
              <p
                key={`${personId}-reason-${reason}`}
                className="text-muted-foreground text-sm leading-snug"
              >
                {reason}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            No reasoning recorded for this score.
          </p>
        )}
      </div>
    </ResponsivePopoverContent>
  </ResponsivePopover>
);
