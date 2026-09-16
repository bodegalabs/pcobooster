"use client";

import type { ReactNode } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface RecommendationPopoverProps {
  reasoning: string[] | undefined;
  personId: string;
  children: ReactNode;
}

export function RecommendationPopover({
  reasoning,
  personId,
  children,
}: RecommendationPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80">
        <p className="text-foreground text-sm font-semibold tracking-tight">
          Why this ranking
        </p>
        {reasoning?.length ? (
          <div className="mt-3 flex flex-col gap-2">
            {reasoning.map((reason, index) => (
              <p
                key={`${personId}-reason-${index}`}
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
      </PopoverContent>
    </Popover>
  );
}
