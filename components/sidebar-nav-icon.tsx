"use client";

import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

export const SidebarNavIcon = ({
  icon,
  className,
}: {
  icon: IconSvgElement;
  className?: string;
}) => (
  <HugeiconsIcon
    icon={icon}
    strokeWidth={2}
    className={cn("size-[1.125rem] shrink-0", className)}
    aria-hidden
  />
);
