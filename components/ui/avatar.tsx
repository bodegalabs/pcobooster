"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const Avatar = ({
  className,
  size = "default",
  corners = "circle",
  status = "none",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "small" | "default" | "responsive";
  corners?: "circle" | "square";
  status?:
    | "none"
    | "confirmed"
    | "scheduled"
    | "declined"
    | "blocked"
    | "available";
}) => (
  <AvatarPrimitive.Root
    data-slot="avatar"
    className={cn(
      "relative flex size-8 shrink-0 overflow-hidden rounded-full",
      size === "small" && "size-6",
      size === "responsive" && "size-8 sm:size-9",
      corners === "square" && "rounded-md",
      (status === "confirmed" ||
        status === "scheduled" ||
        status === "declined") &&
        "ring-offset-background ring-2 ring-offset-2",
      status === "confirmed" && "ring-status-confirmed/80",
      status === "scheduled" && "ring-status-scheduled/80",
      status === "declined" && "ring-status-declined/70",
      className
    )}
    {...props}
  />
);

const AvatarImage = ({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) => (
  <AvatarPrimitive.Image
    data-slot="avatar-image"
    className={cn("aspect-square size-full", className)}
    {...props}
  />
);

const AvatarFallback = ({
  className,
  tone = "muted",
  size = "default",
  corners = "circle",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & {
  tone?: "muted" | "primary" | "soft-primary";
  size?: "default" | "small" | "tiny";
  corners?: "circle" | "square";
}) => (
  <AvatarPrimitive.Fallback
    data-slot="avatar-fallback"
    className={cn(
      "bg-muted flex size-full items-center justify-center rounded-full",
      tone === "primary" && "bg-primary text-primary-foreground",
      tone === "soft-primary" && "bg-primary/10 text-primary",
      corners === "square" && "rounded-md",
      size === "small" && "text-xs font-medium",
      size === "tiny" && "text-[10px] font-medium",
      className
    )}
    {...props}
  />
);

export { Avatar, AvatarImage, AvatarFallback };
