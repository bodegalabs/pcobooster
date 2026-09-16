"use client";

import * as React from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

const ResponsiveDialogContext = React.createContext<{ isMobile: boolean }>({
  isMobile: false,
});

type ResponsiveDialogRootProps = {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ResponsiveDialogContentProps = {
  children: React.ReactNode;
  className?: string;
  desktopClassName?: string;
  mobileClassName?: string;
  showCloseButton?: boolean;
};

function ResponsiveDialog({ children, ...props }: ResponsiveDialogRootProps) {
  const isMobile = useIsMobile();
  const Root = isMobile ? Drawer : Dialog;

  return (
    <ResponsiveDialogContext.Provider value={{ isMobile }}>
      <Root {...props}>{children}</Root>
    </ResponsiveDialogContext.Provider>
  );
}

function ResponsiveDialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Trigger = isMobile ? DrawerTrigger : DialogTrigger;

  return <Trigger {...props} />;
}

function ResponsiveDialogClose({
  ...props
}: React.ComponentProps<typeof DialogClose>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Close = isMobile ? DrawerClose : DialogClose;

  return <Close {...props} />;
}

function ResponsiveDialogContent({
  className,
  desktopClassName,
  mobileClassName,
  showCloseButton = true,
  children,
}: ResponsiveDialogContentProps) {
  const { isMobile } = React.useContext(ResponsiveDialogContext);

  if (isMobile) {
    return (
      <DrawerContent
        className={cn(
          "w-full border-b-0 px-0 pb-[max(1rem,env(safe-area-inset-bottom))]",
          className,
          mobileClassName
        )}
      >
        {children}
      </DrawerContent>
    );
  }

  return (
    <DialogContent
      className={cn(className, desktopClassName)}
      showCloseButton={showCloseButton}
    >
      {children}
    </DialogContent>
  );
}

function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Header = isMobile ? DrawerHeader : DialogHeader;

  return <Header className={className} {...props} />;
}

function ResponsiveDialogFooter({
  className,
  showCloseButton = false,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Footer = isMobile ? DrawerFooter : DialogFooter;

  return (
    <Footer
      className={className}
      showCloseButton={showCloseButton}
      {...props}
    />
  );
}

function ResponsiveDialogTitle({
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Title = isMobile ? DrawerTitle : DialogTitle;

  return <Title {...props} />;
}

function ResponsiveDialogDescription({
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Description = isMobile ? DrawerDescription : DialogDescription;

  return <Description {...props} />;
}

export {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
};
