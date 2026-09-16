import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a&]:hover:bg-primary/90 border-transparent",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 border-transparent",
        destructive:
          "bg-destructive [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 border-transparent text-white",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        confirmed:
          "bg-status-confirmed/15 text-status-confirmed h-5 border-transparent px-1.5 text-[11px]",
        scheduled:
          "bg-status-scheduled/15 text-status-scheduled h-5 border-transparent px-1.5 text-[11px]",
        "plan-key":
          "text-foreground h-6 min-w-6 rounded-full px-2 text-[11px] font-semibold shadow-xs",
        "slot-confirmed":
          "border-status-confirmed-bright/70 bg-status-confirmed/45 text-primary-foreground dark:bg-status-confirmed/50 font-semibold shadow-sm",
        "slot-pending":
          "border-status-scheduled-bright/70 bg-status-scheduled/45 text-primary-foreground dark:bg-status-scheduled/50 font-semibold shadow-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Badge = ({
  className,
  variant,
  asChild = false,
  weight = "medium",
  clipped = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    weight?: "medium" | "normal";
    clipped?: boolean;
  }) => {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(
        badgeVariants({ variant }),
        weight === "normal" && "font-normal",
        clipped && "truncate",
        className
      )}
      {...props}
    />
  );
};

export { Badge };
