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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const ResponsiveDialogContext = React.createContext<{ isMobile: boolean }>({
  isMobile: false,
});

interface ResponsiveDialogRootProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ResponsiveDialogContentProps {
  children: React.ReactNode;
  className?: string;
  desktopClassName?: string;
  mobileClassName?: string;
  showCloseButton?: boolean;
}

const ResponsiveDialog = ({
  children,
  ...props
}: ResponsiveDialogRootProps) => {
  const isMobile = useIsMobile();
  const Root = isMobile ? Drawer : Dialog;
  const contextValue = React.useMemo(() => ({ isMobile }), [isMobile]);

  return (
    <ResponsiveDialogContext.Provider value={contextValue}>
      <Root {...props}>{children}</Root>
    </ResponsiveDialogContext.Provider>
  );
};

const ResponsiveDialogTrigger = ({
  ...props
}: Omit<React.ComponentProps<typeof DialogTrigger>, "handle">) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Trigger = isMobile ? DrawerTrigger : DialogTrigger;

  return <Trigger {...props} />;
};

const ResponsiveDialogClose = ({
  ...props
}: Omit<React.ComponentProps<typeof DialogClose>, "handle">) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Close = isMobile ? DrawerClose : DialogClose;

  return <Close {...props} />;
};

const ResponsiveDialogContent = ({
  className,
  desktopClassName,
  mobileClassName,
  showCloseButton = true,
  children,
}: ResponsiveDialogContentProps) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);

  if (isMobile) {
    return (
      <DrawerContent
        className={cn("border-b-0 px-0", className, mobileClassName)}
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
};

const ResponsiveDialogHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Header = isMobile ? DrawerHeader : DialogHeader;

  return <Header className={className} {...props} />;
};

const ResponsiveDialogFooter = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Footer = isMobile ? DrawerFooter : DialogFooter;

  return <Footer className={className} {...props} />;
};

const ResponsiveDialogTitle = ({
  ...props
}: React.ComponentProps<typeof DialogTitle>) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Title = isMobile ? DrawerTitle : DialogTitle;

  return <Title {...props} />;
};

const ResponsiveDialogDescription = ({
  ...props
}: React.ComponentProps<typeof DialogDescription>) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Description = isMobile ? DrawerDescription : DialogDescription;

  return <Description {...props} />;
};

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
