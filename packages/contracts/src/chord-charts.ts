/** Font sizes Services accepts for `chord_chart_font_size`. */
export const CHORD_CHART_FONT_SIZES = [
  10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 42, 48,
] as const;
export const CHORD_CHART_PAGE_SIZES = [
  "Letter",
  "A4",
  "Legal",
  "11x17",
  "Widescreen (16x9)",
  "Fullscreen (4x3)",
] as const;
export const CHORD_CHART_ORIENTATIONS = ["Portrait", "Landscape"] as const;
export const CHORD_CHART_MARGINS = [
  "0.0in",
  "0.25in",
  "0.5in",
  "0.75in",
  "1.0in",
] as const;
/** Services lays charts out in one or two columns. */
export const CHORD_CHART_MAX_COLUMNS = 2;
/** Fonts Services' Formatting dialog offers, stored in `chord_chart_font` by value. */
export const CHORD_CHART_FONTS = [
  { value: "Helvetica", label: "Arial, Helvetica" },
  { value: "Courier", label: "Courier, Monospaced" },
  { value: "Monaco", label: "Monaco, Monospaced" },
  { value: "Times-Roman", label: "Times New Roman" },
  { value: "Noto Sans", label: "Noto Sans (International)" },
] as const;
/** Chord colors in Services' order; `chord_chart_chord_color` stores the index. */
export const CHORD_CHART_CHORD_COLORS = [
  "Black",
  "Blue",
  "Green",
  "Orange",
  "Purple",
  "Red",
] as const;
