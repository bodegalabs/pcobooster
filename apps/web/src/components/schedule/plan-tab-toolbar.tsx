import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import { LoaderCircle, Music2, Plus, Type } from "lucide-react";
import type { ReactNode } from "react";

import { HotkeyChord } from "@/components/hotkey-chord";
import { Button } from "@/components/ui/button";
import { HoverLabel } from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import { PLAN_BUILDER_SHORTCUTS } from "@/lib/app-hotkeys";
import { formatDuration } from "@/lib/plan-overview";
import type { PlanOrder } from "@/lib/plan-overview";

interface PlanTabToolbarProps {
  order: PlanOrder | null;
  /** Rough key changes between back-to-back songs. */
  keyJumps: number;
  /** Songs sung in the weeks before this plan. */
  repeats: number;
  isReordering: boolean;
  isCreatingBasicItem?: boolean;
  disabled?: boolean;
  onAddSong: () => void;
  onAddHeader: () => void;
  onAddItem: () => void;
}

const pluralize = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const describeOrder = (order: PlanOrder) => {
  const parts = [pluralize(order.songs.length, "song")];
  const length = formatDuration(order.serviceLength);
  if (length !== null) {
    parts.push(length);
  }
  return parts.join(" · ");
};

const insightsOf = (
  keyJumps: number,
  repeats: number,
  songsWithoutKey: number
) =>
  [
    keyJumps > 0 ? pluralize(keyJumps, "key jump") : null,
    repeats > 0 ? pluralize(repeats, "repeat") : null,
    songsWithoutKey > 0 ? `${songsWithoutKey} without a key` : null,
  ].filter((note) => note !== null);

const bindingOf = (id: "plan.addSong" | "plan.addHeader" | "plan.addItem") =>
  PLAN_BUILDER_SHORTCUTS.find((entry) => entry.id === id)?.binding ?? null;

/** A toolbar button whose hover label names it and shows its shortcut. */
const ShortcutButton = ({
  label,
  binding,
  render,
  children,
}: {
  label: string;
  binding: RegisterableHotkey | null;
  render: React.ReactElement;
  children: ReactNode;
}) => (
  <HoverLabel
    label={
      <span className="inline-flex items-center gap-2">
        {label}
        {binding === null ? null : <HotkeyChord binding={binding} id={label} />}
      </span>
    }
    render={render}
  >
    {children}
  </HoverLabel>
);

const Summary = ({
  order,
  keyJumps,
  repeats,
  reordering,
}: {
  order: PlanOrder | null;
  keyJumps: number;
  repeats: number;
  reordering: boolean;
}) => {
  if (reordering) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <LoaderCircle className="size-3.5 animate-spin" />
        Saving order…
      </span>
    );
  }
  if (order === null) {
    return null;
  }
  const insights = insightsOf(keyJumps, repeats, order.songsWithoutKey);
  return (
    <>
      <span>{describeOrder(order)}</span>
      {insights.length === 0 ? null : (
        <span className="text-status-scheduled">{insights.join(" · ")}</span>
      )}
    </>
  );
};

/**
 * The plan's add actions and at-a-glance summary, floating over the bottom of the run
 * sheet so they stay in reach while scrolling.
 */
export const PlanTabToolbar = ({
  order,
  keyJumps,
  repeats,
  isReordering: reordering,
  isCreatingBasicItem = false,
  disabled = false,
  onAddSong,
  onAddHeader,
  onAddItem,
}: PlanTabToolbarProps) => {
  const showSummary = reordering || order !== null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4 max-md:fixed max-md:bottom-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div
        role="toolbar"
        aria-label="Add to plan"
        className="bg-popover text-popover-foreground ring-foreground/5 dark:ring-foreground/10 pointer-events-auto flex items-center gap-1 rounded-full p-1 shadow-lg ring-1"
      >
        {showSummary ? (
          <>
            <p className="text-muted-foreground flex items-center gap-2 pr-1 pl-3 text-sm whitespace-nowrap tabular-nums max-sm:hidden">
              <Summary
                order={order}
                keyJumps={keyJumps}
                repeats={repeats}
                reordering={reordering}
              />
            </p>
            <Separator
              orientation="vertical"
              className="mx-1 h-5 max-sm:hidden"
            />
          </>
        ) : null}
        <ShortcutButton
          label="Add a header"
          binding={bindingOf("plan.addHeader")}
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAddHeader}
              disabled={disabled || isCreatingBasicItem}
            />
          }
        >
          <Type className="size-4 opacity-70" />
          Header
        </ShortcutButton>
        <ShortcutButton
          label="Add an item"
          binding={bindingOf("plan.addItem")}
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAddItem}
              disabled={disabled || isCreatingBasicItem}
            />
          }
        >
          <Plus className="size-4 opacity-70" />
          Item
        </ShortcutButton>
        <ShortcutButton
          label="Add a song"
          binding={bindingOf("plan.addSong")}
          render={
            <Button
              type="button"
              size="sm"
              onClick={onAddSong}
              disabled={disabled}
            />
          }
        >
          <Music2 className="size-4" />
          Add song
        </ShortcutButton>
      </div>
    </div>
  );
};
