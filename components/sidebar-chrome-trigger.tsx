"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

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
