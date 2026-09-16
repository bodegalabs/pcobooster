"use client";

import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { MenuIcon, PanelLeftIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive, Slot } from "radix-ui";
import * as React from "react";

import { HotkeyChord } from "@/components/hotkey-chord";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { SIDEBAR_TOGGLE_HOTKEY } from "@/lib/app-hotkeys";
import { isString } from "@/lib/json";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3rem";

interface SidebarContextProps {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

const useSidebar = () => {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
};

const SidebarProvider = ({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) => {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = openProp ?? internalOpen;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (setOpenProp === undefined) {
        setInternalOpen(nextOpen);
      } else {
        setOpenProp(nextOpen);
      }
    },
    [setOpenProp]
  );

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((wasOpen) => !wasOpen);
    } else {
      setOpen(!open);
    }
  }, [isMobile, open, setOpen]);

  // Global Mod+B shortcut is managed by SidebarToggleHotkey (TanStack Hotkeys).

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  );

  const sidebarStyle: React.CSSProperties & {
    "--sidebar-width": string;
    "--sidebar-width-icon": string;
  } = {
    "--sidebar-width": SIDEBAR_WIDTH,
    "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
    ...style,
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={sidebarStyle}
        className={cn(
          "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
};

const offcanvasPeekVisible =
  "group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:top-3 group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:bottom-3 group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:z-[60] group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:h-auto group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:top-3 group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:bottom-3 group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:z-[60] group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:h-auto";

const getOffcanvasPeekCard = (
  collapsible: "offcanvas" | "icon" | "none",
  side: "left" | "right"
): string | null => {
  if (collapsible !== "offcanvas") {
    return null;
  }
  return cn(
    offcanvasPeekVisible,
    side === "left"
      ? "group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:left-3 group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:left-3"
      : "group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:right-3 group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:right-3"
  );
};

/** Keeps offcanvas peek styling while true (e.g. header dropdown open — content portals outside hover group). */
const Sidebar = ({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  trailingChrome,
  collapsePreview = false,
  peekLocked = false,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  trailingChrome?: React.ReactNode;
  collapsePreview?: boolean;
  peekLocked?: boolean;
}) => {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <DialogPrimitive.Root
        open={openMobile}
        onOpenChange={setOpenMobile}
        {...props}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "bg-background/80 fixed inset-0 z-50 backdrop-blur-sm",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
              "data-[state=closed]:duration-150 data-[state=open]:duration-200"
            )}
          />
          <DialogPrimitive.Content
            data-sidebar="sidebar"
            data-slot="sidebar"
            data-mobile="true"
            className={cn(
              "bg-sidebar text-sidebar-foreground fixed inset-0 z-50 flex min-h-0 flex-col outline-none",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
              "data-[state=closed]:duration-150 data-[state=open]:duration-200",
              className
            )}
            onClickCapture={(event) => {
              const { target } = event;
              if (!(target instanceof Element)) {
                return;
              }
              if (target.closest("a")) {
                setOpenMobile(false);
              }
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              Navigation
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Main navigation menu.
            </DialogPrimitive.Description>
            <div className="border-sidebar-border/70 flex h-12 shrink-0 items-center justify-between border-b px-3">
              <span className="text-sm font-semibold">worshipadmin.com</span>
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Close navigation"
                >
                  <XIcon className="size-4" aria-hidden />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  const offcanvasPeekCard = getOffcanvasPeekCard(collapsible, side);
  const isFloatingLayout = variant === "floating" || variant === "inset";

  return (
    <div
      className="group group/sidebar-peek peer text-sidebar-foreground hidden md:block"
      data-peek-locked={peekLocked || undefined}
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {collapsible === "offcanvas" && state === "collapsed" ? (
        <div
          aria-hidden
          data-slot="sidebar-hover-zone"
          className="fixed inset-y-0 left-0 z-[55] hidden w-4 md:block"
        />
      ) : null}
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent ease-out [transition:width_45ms_ease-out,opacity_200ms_ease-out]",
          collapsePreview ? "opacity-[0.38]" : "opacity-100",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          isFloatingLayout
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,top,bottom,width] duration-[45ms] ease-out md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          offcanvasPeekCard,
          // Adjust the padding for floating and inset variants.
          isFloatingLayout
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn(
            "bg-sidebar flex h-full w-full flex-col transition-opacity duration-200 ease-out",
            collapsePreview ? "opacity-[0.38]" : "opacity-100",
            "group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm",
            collapsible === "offcanvas" &&
              "group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:border-sidebar-border group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:border-sidebar-border group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:rounded-xl group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:border group-data-[collapsible=offcanvas]:group-hover/sidebar-peek:shadow-xl group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:rounded-xl group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:border group-data-[collapsible=offcanvas]:group-data-[peek-locked]/sidebar-peek:shadow-xl"
          )}
        >
          {children}
        </div>
        {trailingChrome}
      </div>
    </div>
  );
};

const SidebarTrigger = ({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) => {
  const { isMobile, toggleSidebar } = useSidebar();

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <Button
          data-sidebar="trigger"
          data-slot="sidebar-trigger"
          variant="ghost"
          size="icon"
          className={cn("size-7", isMobile && "size-9", className)}
          onClick={(event) => {
            onClick?.(event);
            toggleSidebar();
          }}
          {...props}
        >
          {isMobile ? <MenuIcon /> : <PanelLeftIcon />}
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="center"
        sideOffset={8}
        className="w-auto px-3 py-2"
      >
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium">Toggle sidebar</p>
          <HotkeyChord
            binding={SIDEBAR_TOGGLE_HOTKEY}
            id="sidebar-toggle-hover"
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const SidebarRail = ({
  className,
  ...props
}: React.ComponentProps<"button">) => {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all duration-[45ms] ease-out group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  );
};

const SidebarInset = ({
  className,
  ...props
}: React.ComponentProps<"main">) => (
  <main
    data-slot="sidebar-inset"
    className={cn(
      "bg-background relative flex w-full flex-1 flex-col",
      "md:peer-data-[variant=inset]:border-border/70 md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-lg md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:shadow-none md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
      className
    )}
    {...props}
  />
);

const SidebarInput = ({
  className,
  ...props
}: React.ComponentProps<typeof Input>) => (
  <Input
    data-slot="sidebar-input"
    data-sidebar="input"
    className={cn("bg-background h-8 w-full shadow-none", className)}
    {...props}
  />
);

const SidebarHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    data-slot="sidebar-header"
    data-sidebar="header"
    className={cn("flex flex-col gap-2 p-2", className)}
    {...props}
  />
);

const SidebarFooter = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    data-slot="sidebar-footer"
    data-sidebar="footer"
    className={cn("flex flex-col gap-2 p-2", className)}
    {...props}
  />
);

const SidebarSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) => (
  <Separator
    data-slot="sidebar-separator"
    data-sidebar="separator"
    className={cn("bg-sidebar-border mx-2 w-auto", className)}
    {...props}
  />
);

const SidebarContent = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    data-slot="sidebar-content"
    data-sidebar="content"
    className={cn(
      "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
      className
    )}
    {...props}
  />
);

const SidebarGroup = ({
  className,
  treatment = "default",
  ...props
}: React.ComponentProps<"div"> & {
  treatment?: "default" | "schedule";
}) => (
  <div
    data-slot="sidebar-group"
    data-sidebar="group"
    className={cn(
      "relative flex w-full min-w-0 flex-col p-2",
      treatment === "schedule" &&
        "border-sidebar-border/40 border-t px-0 py-0 first:border-0",
      className
    )}
    {...props}
  />
);

const SidebarGroupLabel = ({
  className,
  asChild = false,
  treatment = "default",
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean;
  treatment?: "default" | "schedule";
}) => {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        treatment === "schedule" &&
          "hover:bg-sidebar-accent/50 gap-2 rounded-none px-2.5",
        className
      )}
      {...props}
    />
  );
};

const SidebarGroupAction = ({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) => {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
};

const SidebarGroupContent = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    data-slot="sidebar-group-content"
    data-sidebar="group-content"
    className={cn("w-full text-sm", className)}
    {...props}
  />
);

const SidebarMenu = ({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"ul"> & {
  density?: "default" | "flush";
}) => (
  <ul
    data-slot="sidebar-menu"
    data-sidebar="menu"
    className={cn(
      "flex w-full min-w-0 flex-col gap-1",
      density === "flush" && "gap-0",
      className
    )}
    {...props}
  />
);

const SidebarMenuItem = ({
  className,
  ...props
}: React.ComponentProps<"li">) => (
  <li
    data-slot="sidebar-menu-item"
    data-sidebar="menu-item"
    className={cn("group/menu-item relative", className)}
    {...props}
  />
);

const sidebarMenuButtonVariants = cva(
  "peer/menu-button ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:font-medium [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        account:
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
        schedule: "rounded-none pr-2 pl-5 transition-none",
        "schedule-add":
          "text-sidebar-foreground/45 hover:bg-sidebar-accent/25 hover:text-sidebar-foreground/65 data-[state=open]:bg-sidebar-accent/25 data-[state=open]:text-sidebar-foreground/65 rounded-none pr-2 pl-5 transition-none",
        "group-tab":
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl px-2.5 text-[13px] font-medium",
        outline:
          "bg-background hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shadow-[0_0_0_1px_var(--sidebar-border)] hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const SidebarMenuButton = ({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  hoverCard,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  hoverCard?: string | React.ComponentProps<typeof HoverCardContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) => {
  const Comp = asChild ? Slot.Root : "button";
  const { isMobile } = useSidebar();

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );

  if (hoverCard === undefined || hoverCard === "") {
    return button;
  }
  const hoverCardProps = isString(hoverCard)
    ? { children: hoverCard }
    : hoverCard;

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>{button}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="center"
        hidden={isMobile}
        className="w-auto px-3 py-2 text-xs font-medium"
        {...hoverCardProps}
      />
    </HoverCard>
  );
};

const SidebarMenuAction = ({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
}) => {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  );
};

const SidebarMenuBadge = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    data-slot="sidebar-menu-badge"
    data-sidebar="menu-badge"
    className={cn(
      "text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
      "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
      "peer-data-[size=sm]/menu-button:top-1",
      "peer-data-[size=default]/menu-button:top-1.5",
      "peer-data-[size=lg]/menu-button:top-2.5",
      "group-data-[collapsible=icon]:hidden",
      className
    )}
    {...props}
  />
);

const SidebarMenuSkeleton = ({
  className,
  showIcon = false,
  width = "70%",
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
  width?: string;
}) => {
  const skeletonStyle: React.CSSProperties & {
    "--skeleton-width": string;
  } = { "--skeleton-width": width };

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={skeletonStyle}
      />
    </div>
  );
};

const SidebarMenuSub = ({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"ul"> & {
  density?: "default" | "grouped";
}) => (
  <ul
    data-slot="sidebar-menu-sub"
    data-sidebar="menu-sub"
    className={cn(
      "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
      "group-data-[collapsible=icon]:hidden",
      density === "grouped" && "gap-1 border-0 p-0",
      className
    )}
    {...props}
  />
);

const SidebarMenuSubItem = ({
  className,
  ...props
}: React.ComponentProps<"li">) => (
  <li
    data-slot="sidebar-menu-sub-item"
    data-sidebar="menu-sub-item"
    className={cn("group/menu-sub-item relative", className)}
    {...props}
  />
);

const SidebarMenuSubButton = ({
  asChild = false,
  size = "md",
  isActive = false,
  treatment = "default",
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
  size?: "sm" | "md";
  isActive?: boolean;
  treatment?: "default" | "group-tab";
}) => {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        treatment === "group-tab" && "rounded-xl px-2.5 text-[13px]",
        className
      )}
      {...props}
    />
  );
};

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
