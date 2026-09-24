import { Menu01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export const SidebarChromeTrigger = ({
  when,
}: {
  when: "sidebar" | "inset";
}) => {
  const { open, isMobile } = useSidebar();

  if (isMobile) {
    return when === "inset" ? <SidebarTrigger /> : null;
  }

  if (when === "sidebar" && !open) {
    return null;
  }

  if (when === "inset" && open) {
    return null;
  }

  return <SidebarTrigger />;
};

/** Phone menu button; opens the sidebar as a sheet. */
export const MobileMenuTrigger = ({ className }: { className?: string }) => {
  const { openMobile, toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label="Open menu"
      aria-expanded={openMobile}
      className={cn("shrink-0 md:hidden", className)}
      onClick={toggleSidebar}
    >
      <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-5" />
    </Button>
  );
};

/** Closes the phone sheet once a menu link navigates. */
export const MobileSidebarCloseOnNavigate = () => {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  useEffect(
    () =>
      router.subscribe("onBeforeNavigate", () => {
        setOpenMobile(false);
      }),
    [router, setOpenMobile]
  );

  return null;
};
