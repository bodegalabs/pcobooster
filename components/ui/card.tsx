import * as React from "react";

import { cn } from "@/lib/utils";

type CardDensity = "default" | "compact" | "comfortable" | "empty";

const Card = ({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"div"> & {
  density?: CardDensity;
}) => (
  <div
    data-slot="card"
    className={cn(
      "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
      density === "compact" &&
        "border-border/40 gap-3 rounded-lg py-3 shadow-none",
      density === "comfortable" &&
        "border-border/40 gap-4 rounded-lg py-4 shadow-none",
      density === "empty" &&
        "border-border/50 border-dashed bg-transparent px-6 py-8",
      className
    )}
    {...props}
  />
);

const CardHeader = ({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"div"> & { density?: CardDensity }) => (
  <div
    data-slot="card-header"
    className={cn(
      "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
      density === "compact" && "gap-1 px-4",
      className
    )}
    {...props}
  />
);

const CardTitle = ({
  className,
  scale = "default",
  ...props
}: React.ComponentProps<"div"> & {
  scale?: "default" | "metric" | "section" | "section-icon";
}) => (
  <div
    data-slot="card-title"
    className={cn(
      "leading-none font-semibold",
      scale === "metric" && "text-2xl tabular-nums",
      scale === "section" && "text-sm",
      scale === "section-icon" && "flex items-center gap-2 text-sm",
      className
    )}
    {...props}
  />
);

const CardDescription = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    data-slot="card-description"
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
);

const CardAction = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card-action"
    className={cn(
      "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
      className
    )}
    {...props}
  />
);

const CardContent = ({
  className,
  density = "default",
  layout = "default",
  tone = "default",
  textSize = "default",
  ...props
}: React.ComponentProps<"div"> & {
  density?: CardDensity;
  layout?: "default" | "tight-stack" | "stack" | "grid";
  tone?: "default" | "muted";
  textSize?: "default" | "body";
}) => (
  <div
    data-slot="card-content"
    className={cn(
      "px-6",
      density === "compact" && "px-4",
      layout === "tight-stack" && "flex flex-col gap-1",
      layout === "stack" && "flex flex-col gap-2",
      layout === "grid" && "grid gap-2",
      tone === "muted" && "text-muted-foreground",
      textSize === "body" && "text-sm",
      className
    )}
    {...props}
  />
);

const CardFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card-footer"
    className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
    {...props}
  />
);

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
