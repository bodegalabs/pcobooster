import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { useHotkey } from "@tanstack/react-hotkeys";

import { PLAN_BUILDER_SHORTCUTS } from "@/lib/app-hotkeys";

type PlanBuilderShortcutId = (typeof PLAN_BUILDER_SHORTCUTS)[number]["id"];

const bindingOf = (id: PlanBuilderShortcutId) => {
  const found = PLAN_BUILDER_SHORTCUTS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`Unknown plan builder shortcut: ${id}`);
  }
  return found.binding;
};

interface UsePlanBuilderHotkeysOptions {
  /** Off while a dialog, picker, or drag has the keyboard. */
  enabled: boolean;
  items: readonly PlanItem[];
  selectedItemId: string | null;
  onSelect: (itemId: string | null) => void;
  onMove: (itemId: string, offset: -1 | 1) => void;
  onToggleDetails: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onAddSong: () => void;
  onAddBasic: (kind: "header" | "item") => void;
  /** Escape hides the details first, then clears the selection. */
  onEscape: () => void;
}

/** The run sheet's keyboard: move through rows, rearrange them, and add at the insertion line. */
export const usePlanBuilderHotkeys = ({
  enabled,
  items,
  selectedItemId,
  onSelect,
  onMove,
  onToggleDetails,
  onRemove,
  onAddSong,
  onAddBasic,
  onEscape,
}: UsePlanBuilderHotkeysOptions) => {
  const selectedIndex =
    selectedItemId === null
      ? -1
      : items.findIndex((item) => item.id === selectedItemId);
  const selected = items[selectedIndex] ?? null;

  const step = (offset: -1 | 1) => {
    if (items.length === 0) {
      return;
    }
    if (selected === null) {
      onSelect((offset === 1 ? items[0] : items.at(-1))?.id ?? null);
      return;
    }
    const nextIndex = Math.min(
      items.length - 1,
      Math.max(0, selectedIndex + offset)
    );
    onSelect(items[nextIndex]?.id ?? null);
  };
  const removeSelected = () => {
    if (selected === null) {
      return;
    }
    const neighbor = items[selectedIndex + 1] ?? items[selectedIndex - 1];
    onRemove(selected.id);
    onSelect(neighbor?.id ?? null);
  };
  const withSelection = (action: (itemId: string) => void) => () => {
    if (selected !== null) {
      action(selected.id);
    }
  };

  const anywhere = { enabled, ignoreInputs: true } as const;
  const onRow = { enabled: enabled && selected !== null, ignoreInputs: true };
  useHotkey(
    bindingOf("plan.next"),
    () => {
      step(1);
    },
    anywhere
  );
  useHotkey(
    "ArrowDown",
    () => {
      step(1);
    },
    anywhere
  );
  useHotkey(
    bindingOf("plan.previous"),
    () => {
      step(-1);
    },
    anywhere
  );
  useHotkey(
    "ArrowUp",
    () => {
      step(-1);
    },
    anywhere
  );
  useHotkey(
    bindingOf("plan.moveDown"),
    withSelection((itemId) => {
      onMove(itemId, 1);
    }),
    onRow
  );
  useHotkey(
    bindingOf("plan.moveUp"),
    withSelection((itemId) => {
      onMove(itemId, -1);
    }),
    onRow
  );
  useHotkey(bindingOf("plan.details"), withSelection(onToggleDetails), onRow);
  useHotkey(bindingOf("plan.remove"), removeSelected, onRow);
  useHotkey("Delete", removeSelected, onRow);
  useHotkey(bindingOf("plan.addSong"), onAddSong, anywhere);
  useHotkey(
    bindingOf("plan.addHeader"),
    () => {
      onAddBasic("header");
    },
    anywhere
  );
  useHotkey(
    bindingOf("plan.addItem"),
    () => {
      onAddBasic("item");
    },
    anywhere
  );
  useHotkey(bindingOf("plan.clear"), onEscape, onRow);
};
