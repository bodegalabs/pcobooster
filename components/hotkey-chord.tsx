"use client";

import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import { useSyncExternalStore } from "react";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { hotkeyAriaLabel, hotkeyChordSegments } from "@/lib/hotkey-display";

interface HotkeyChordProps {
  binding: RegisterableHotkey;
  /** Stable identifier for React keys (e.g. shortcut id). */
  id: string;
  className?: string;
  treatment?: "default" | "menu";
}

const subscribeToHydration = () => () => {
  // Hydration needs a client snapshot once; no external listener is required.
};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Platform-aware chord (client-only segmentation to avoid SSR / hydration mismatches).
 */
export const HotkeyChord = ({
  binding,
  id: chordId,
  className,
  treatment = "default",
}: HotkeyChordProps) => {
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot
  );
  const segments = isHydrated ? hotkeyChordSegments(binding) : null;
  const label = isHydrated ? hotkeyAriaLabel(binding) : "Keyboard shortcut";

  if (segments === null || segments.length === 0) {
    return (
      <Kbd aria-label={label} treatment={treatment} className={className}>
        …
      </Kbd>
    );
  }

  return (
    <KbdGroup treatment={treatment} className={className} aria-label={label}>
      {segments.map((segment) => (
        <Kbd key={`${chordId}-${segment}`}>{segment}</Kbd>
      ))}
    </KbdGroup>
  );
};
