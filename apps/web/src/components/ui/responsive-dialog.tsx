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
  /** `flush` drops the dialog's padding so a header can run edge to edge. */
  layout?: "default" | "flush";
  /** The element to focus on open, such as the primary action. */
  initialFocus?: React.RefObject<HTMLElement | null>;
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
  layout = "default",
  initialFocus,
  children,
}: ResponsiveDialogContentProps) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);

  if (isMobile) {
    return (
      <DrawerContent
        className={cn("border-b-0 px-0", className, mobileClassName)}
        {...(initialFocus === undefined ? {} : { initialFocus })}
      >
        {children}
      </DrawerContent>
    );
  }

  return (
    <DialogContent
      className={cn(
        layout === "flush" && "gap-0 overflow-hidden p-0",
        className,
        desktopClassName
      )}
      showCloseButton={showCloseButton}
      initialFocus={initialFocus}
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

/** `hero` is the large display title for welcome and announcement dialogs. */
const responsiveDialogTitleVariants = {
  default: undefined,
  hero: "text-2xl leading-tight font-semibold tracking-tight text-balance md:text-3xl",
} as const;

const ResponsiveDialogTitle = ({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DialogTitle> & {
  variant?: keyof typeof responsiveDialogTitleVariants;
}) => {
  const { isMobile } = React.useContext(ResponsiveDialogContext);
  const Title = isMobile ? DrawerTitle : DialogTitle;

  return (
    <Title
      className={cn(responsiveDialogTitleVariants[variant], className)}
      {...props}
    />
  );
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
