import type { RegisterableHotkey } from "@tanstack/hotkeys";

export const SIDEBAR_TOGGLE_HOTKEY =
  "Mod+B" as const satisfies RegisterableHotkey;

export const SHORTCUTS_PALETTE_HOTKEY =
  "Mod+/" as const satisfies RegisterableHotkey;

export const APP_SHORTCUTS = [
  {
    id: "sidebar.toggle",
    label: "Toggle sidebar",
    binding: SIDEBAR_TOGGLE_HOTKEY,
  },
  {
    id: "shortcuts.palette",
    label: "Keyboard shortcuts",
    binding: SHORTCUTS_PALETTE_HOTKEY,
  },
] as const;
