"use client";

import { ChevronDown } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const Accordion = ({
  className,
  density = "default",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root> & {
  density?: "default" | "lineup";
}) => (
  <AccordionPrimitive.Root
    data-slot="accordion"
    className={cn(density === "lineup" && "px-2 py-0.5", className)}
    {...props}
  />
);

const AccordionItem = ({
  className,
  treatment = "default",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item> & {
  treatment?: "default" | "lineup";
}) => (
  <AccordionPrimitive.Item
    data-slot="accordion-item"
    className={cn(
      "border-b last:border-b-0",
      treatment === "lineup" &&
        "hover:bg-muted/40 rounded-sm border-b-0 transition-colors",
      className
    )}
    {...props}
  />
);

const AccordionHeader = ({
  className,
  density = "default",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Header> & {
  density?: "default" | "lineup";
}) => (
  <AccordionPrimitive.Header
    className={cn(
      "flex items-center gap-1",
      density === "lineup" && "rounded-none px-1 py-0",
      className
    )}
    {...props}
  />
);

const AccordionTrigger = ({
  className,
  children,
  density = "default",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  density?: "default" | "lineup";
}) => (
  <AccordionPrimitive.Trigger
    data-slot="accordion-trigger"
    className={cn(
      "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-center justify-between gap-2 rounded-sm py-3 text-left text-sm font-medium transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
      density === "lineup" && "gap-1 rounded-none py-2 hover:no-underline",
      className
    )}
    {...props}
  >
    {children}
    <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform duration-200" />
  </AccordionPrimitive.Trigger>
);

const AccordionContent = ({
  className,
  children,
  density = "default",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content> & {
  density?: "default" | "lineup";
}) => (
  <AccordionPrimitive.Content
    data-slot="accordion-content"
    className={cn(
      "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm",
      density === "lineup" && "pt-0 pb-3",
      className
    )}
    {...props}
  >
    <div className="pb-3">{children}</div>
  </AccordionPrimitive.Content>
);

export {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
};
