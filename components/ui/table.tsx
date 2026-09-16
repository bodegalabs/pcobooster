"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const Table = ({ className, ...props }: React.ComponentProps<"table">) => (
  <div data-slot="table-container" className="relative w-full overflow-auto">
    <table
      data-slot="table"
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
);

const TableHeader = ({
  className,
  surface = "default",
  ...props
}: React.ComponentProps<"thead"> & {
  surface?: "default" | "background";
}) => (
  <thead
    data-slot="table-header"
    className={cn(
      "[&_tr]:border-b",
      surface === "background" && "bg-background",
      className
    )}
    {...props}
  />
);

const TableBody = ({ className, ...props }: React.ComponentProps<"tbody">) => (
  <tbody
    data-slot="table-body"
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
);

const TableFooter = ({
  className,
  ...props
}: React.ComponentProps<"tfoot">) => (
  <tfoot
    data-slot="table-footer"
    className={cn(
      "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
);

const TableRow = ({
  className,
  treatment = "default",
  scheduled = false,
  ...props
}: React.ComponentProps<"tr"> & {
  treatment?:
    | "default"
    | "heading"
    | "loading"
    | "interactive"
    | "selector"
    | "admin-link";
  scheduled?: boolean;
}) => (
  <tr
    data-slot="table-row"
    className={cn(
      "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
      treatment === "heading" &&
        "border-border/40 [&>th]:text-muted-foreground hover:bg-transparent [&>th]:text-xs [&>th]:font-medium",
      treatment === "loading" && "[&>td]:h-12 [&>td]:py-0",
      treatment === "interactive" &&
        "hover:bg-muted/60 transition-none [&>td]:h-12 [&>td]:py-0",
      treatment === "selector" &&
        "hover:bg-muted/60 transition-none [&>td]:h-10 [&>td]:py-0 [&>td]:transition-none",
      treatment === "admin-link" &&
        "focus-visible:bg-muted/50 focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
      scheduled &&
        "[&>td:first-child]:shadow-[inset_2px_0_0_0_var(--color-status-confirmed)]",
      className
    )}
    {...props}
  />
);

const TableHead = ({
  className,
  inset = "default",
  ...props
}: React.ComponentProps<"th"> & {
  inset?: "default" | "compact" | "leading" | "leading-wide";
}) => (
  <th
    data-slot="table-head"
    className={cn(
      "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      inset === "compact" && "px-3",
      inset === "leading" && "pr-3 pl-4",
      inset === "leading-wide" && "pr-3 pl-5",
      className
    )}
    {...props}
  />
);

const TableCell = ({
  className,
  inset = "default",
  tone = "default",
  emphasis = "default",
  numeric = false,
  scheduled = false,
  code = false,
  ...props
}: React.ComponentProps<"td"> & {
  inset?:
    | "default"
    | "compact"
    | "leading"
    | "leading-wide"
    | "empty"
    | "empty-tall";
  tone?: "default" | "muted";
  emphasis?: "default" | "body" | "strong";
  numeric?: boolean;
  scheduled?: boolean;
  code?: boolean;
}) => (
  <td
    data-slot="table-cell"
    className={cn(
      "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      inset === "compact" && "px-3",
      inset === "leading" && "pr-3 pl-4",
      inset === "leading-wide" && "pr-3 pl-5",
      inset === "empty" && "px-4 py-8",
      inset === "empty-tall" && "px-4 py-10",
      tone === "muted" && "text-muted-foreground",
      emphasis === "body" && "text-sm",
      emphasis === "strong" && "text-sm font-medium",
      numeric && "tabular-nums",
      scheduled && "text-status-confirmed",
      code && "font-mono text-xs",
      className
    )}
    {...props}
  />
);

const TableCaption = ({
  className,
  ...props
}: React.ComponentProps<"caption">) => (
  <caption
    data-slot="table-caption"
    className={cn("text-muted-foreground mt-4 text-sm", className)}
    {...props}
  />
);

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
