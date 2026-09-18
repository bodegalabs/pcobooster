"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const positionPickerRowVariants = cva(
  "ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground flex h-9 w-full items-center gap-2 overflow-hidden rounded-xl px-3 py-2 text-left text-sm outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      active: {
        true: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        false: "",
      },
      tone: {
        default: "text-sidebar-foreground",
        muted: "text-muted-foreground",
      },
    },
    defaultVariants: {
      active: false,
      tone: "default",
    },
  }
);

export const PositionPickerRow = ({
  active = false,
  tone = "default",
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> &
  VariantProps<typeof positionPickerRowVariants>) =>
  useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(positionPickerRowVariants({ active, tone, className })),
        type: "button",
      },
      props
    ),
    render,
    state: {
      slot: "position-picker-row",
      active,
      tone,
    },
  });
