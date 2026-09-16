import {
  detectPlatform,
  formatForDisplay,
  type RegisterableHotkey,
} from "@tanstack/hotkeys";

/**
 * Spoken UI label — modifier names as words so assistive tech says “command B”, not glyphs.
 */
export function hotkeyAriaLabel(binding: RegisterableHotkey): string {
  return formatForDisplay(binding, {
    platform: detectPlatform(),
    useSymbols: false,
  });
}

/**
 * Tokenized labels for composing individual {@link Kbd} keys.
 */
export function hotkeyChordSegments(binding: RegisterableHotkey): string[] {
  const formatted = formatForDisplay(binding);
  const platform = detectPlatform();
  if (platform === "mac") return formatted.split(/\s+/).filter(Boolean);
  return formatted.split("+").filter(Boolean);
}
