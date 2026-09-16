"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    data-slot="drawer"
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
);

const DrawerTrigger = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) => (
  <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
);

const DrawerPortal = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) => (
  <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
);

const DrawerClose = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) => (
  <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
);

const DrawerOverlay = ({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) => (
  <DrawerPrimitive.Overlay
    data-slot="drawer-overlay"
    className={cn("fixed inset-0 z-50 bg-black/50", className)}
    {...props}
  />
);

const DrawerContent = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      className={cn(
        "bg-background fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90svh] flex-col rounded-t-[18px] border shadow-lg outline-none",
        className
      )}
      {...props}
    >
      <div className="bg-muted mx-auto mt-4 h-1.5 w-12 shrink-0 rounded-full" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
);

const DrawerHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="drawer-header"
    className={cn("flex flex-col gap-2 p-4 text-center", className)}
    {...props}
  />
);

const DrawerFooter = ({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) => (
  <div
    data-slot="drawer-footer"
    className={cn("mt-auto flex flex-col gap-2 p-4 pt-2", className)}
    {...props}
  >
    {children}
    {showCloseButton ? (
      <DrawerPrimitive.Close asChild>
        <Button variant="outline">Close</Button>
      </DrawerPrimitive.Close>
    ) : null}
  </div>
);

const DrawerTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) => (
  <DrawerPrimitive.Title
    data-slot="drawer-title"
    className={cn("text-lg leading-none font-semibold", className)}
    {...props}
  />
);

const DrawerDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) => (
  <DrawerPrimitive.Description
    data-slot="drawer-description"
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
);

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
};
