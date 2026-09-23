import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

const monthGridDayVariants = cva(
  "hover:bg-muted/60 focus-visible:ring-ring/50 data-[selected=true]:ring-ring/40 flex aspect-square flex-col items-start justify-between border text-left text-xs tabular-nums outline-none focus-visible:ring-2 data-[selected=true]:ring-2",
  {
    variants: {
      size: {
        sm: "min-h-7 rounded-sm p-1",
        default: "rounded-md p-1.5",
        lg: "min-h-10 rounded-md p-1 sm:min-h-16 sm:p-2",
      },
      tone: {
        empty: "border-border/35 text-muted-foreground",
        light: "border-border/40 bg-muted text-foreground",
        busy: "border-border/40 bg-status-confirmed-bright/10 text-foreground",
        peak: "border-border/40 bg-status-confirmed-bright/20 text-foreground",
        confirmed:
          "border-status-confirmed/30 bg-status-confirmed/15 text-status-confirmed",
        scheduled:
          "border-status-scheduled/35 bg-status-scheduled/15 text-status-scheduled",
        rehearsal: "border-muted-foreground/20 bg-muted text-foreground",
      },
    },
    defaultVariants: {
      size: "default",
      tone: "empty",
    },
  }
);

type MonthGridDayTone = NonNullable<
  VariantProps<typeof monthGridDayVariants>["tone"]
>;

/** A tappable day in a month grid, tinted by how busy or committed the day is. */
const MonthGridDay = ({
  className,
  size,
  tone,
  selected = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof monthGridDayVariants> & { selected?: boolean }) => (
  <button
    data-slot="month-grid-day"
    data-selected={selected}
    type="button"
    className={cn(monthGridDayVariants({ size, tone }), className)}
    {...props}
  />
);

export { MonthGridDay };
export type { MonthGridDayTone };
