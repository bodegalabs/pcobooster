"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export const SidebarSeamTrigger = ({ className }: { className?: string }) => {
  const { open, isMobile } = useSidebar();

  if (isMobile) {
    return null;
  }

  return (
    <div
      data-open={open ? "" : undefined}
      className={cn(
        "sidebar-seam-trigger fixed top-4 z-30 hidden md:block",
        className
      )}
    >
      <SidebarTrigger />
    </div>
  );
};
