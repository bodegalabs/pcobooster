"use client";

import type { RegisterableHotkey } from "@tanstack/hotkeys";
import { useEffect, useState } from "react";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { hotkeyAriaLabel, hotkeyChordSegments } from "@/lib/hotkey-display";
import { cn } from "@/lib/utils";

type HotkeyChordProps = {
  binding: RegisterableHotkey;
  /** Stable identifier for React keys (e.g. shortcut id). */
  id: string;
  className?: string;
};

/**
 * Platform-aware chord (client-only segmentation to avoid SSR / hydration mismatches).
 */
export function HotkeyChord({
  binding,
  id: chordId,
  className,
}: HotkeyChordProps) {
  const [segments, setSegments] = useState<string[] | null>(null);

  useEffect(() => {
    setSegments(hotkeyChordSegments(binding));
  }, [binding]);

  const label = hotkeyAriaLabel(binding);

  if (!segments?.length) {
    return (
      <Kbd aria-label={label} className={cn("tabular-nums", className)}>
        …
      </Kbd>
    );
  }

  return (
    <KbdGroup className={cn("tabular-nums", className)} aria-label={label}>
      {segments.map((segment, index) => (
        <Kbd key={`${chordId}-${String(index)}-${segment}`}>{segment}</Kbd>
      ))}
    </KbdGroup>
  );
}
