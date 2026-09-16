"use client";

import { useHotkey } from "@tanstack/react-hotkeys";

import { useSidebar } from "@/components/ui/sidebar";
import { SIDEBAR_TOGGLE_HOTKEY } from "@/lib/app-hotkeys";

/**
 * Registers the global sidebar toggle (must render under {@link SidebarProvider}).
 */
export const SidebarToggleHotkey = () => {
  const { toggleSidebar } = useSidebar();

  useHotkey(SIDEBAR_TOGGLE_HOTKEY, () => {
    toggleSidebar();
  });

  return null;
};
