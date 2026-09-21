import { detectPlatform, formatForDisplay } from "@tanstack/react-hotkeys";
import type { RegisterableHotkey } from "@tanstack/react-hotkeys";

/**
 * Spoken UI label — modifier names as words so assistive tech says “command B”, not glyphs.
 */
export const hotkeyAriaLabel = (binding: RegisterableHotkey): string =>
  formatForDisplay(binding, {
    platform: detectPlatform(),
    useSymbols: false,
  });

/**
 * Tokenized labels for composing individual {@link Kbd} keys.
 */
export const hotkeyChordSegments = (binding: RegisterableHotkey): string[] => {
  const formatted = formatForDisplay(binding);
  const platform = detectPlatform();
  if (platform === "mac") {
    return formatted.split(/\s+/u).filter(Boolean);
  }
  return formatted.split("+").filter(Boolean);
};
