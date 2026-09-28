import type { RegisterableHotkey } from "@tanstack/react-hotkeys";

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

/** Plan builder keys; they act on the selected run sheet row and skip text fields. */
export const PLAN_BUILDER_SHORTCUTS = [
  { id: "plan.next", label: "Next row", binding: "J" },
  { id: "plan.previous", label: "Previous row", binding: "K" },
  { id: "plan.moveDown", label: "Move row down", binding: "Alt+ArrowDown" },
  { id: "plan.moveUp", label: "Move row up", binding: "Alt+ArrowUp" },
  { id: "plan.details", label: "Open the row's details", binding: "Enter" },
  { id: "plan.addSong", label: "Add a song after the row", binding: "/" },
  { id: "plan.addHeader", label: "Add a header after the row", binding: "H" },
  { id: "plan.addItem", label: "Add an item after the row", binding: "I" },
  { id: "plan.remove", label: "Remove the row", binding: "Backspace" },
  {
    id: "plan.clear",
    label: "Close details, then clear the selection",
    binding: "Escape",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  binding: RegisterableHotkey;
}[];
