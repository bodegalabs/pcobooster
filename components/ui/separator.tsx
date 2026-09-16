"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const Separator = ({
  className,
  orientation = "horizontal",
  decorative = true,
  muted = false,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> & {
  muted?: boolean;
}) => (
  <SeparatorPrimitive.Root
    data-slot="separator"
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
      muted && "opacity-30",
      className
    )}
    {...props}
  />
);

export { Separator };
