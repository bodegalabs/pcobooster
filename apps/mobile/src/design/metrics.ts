import { StyleSheet } from "react-native";

/** Spacing on a 4 pt grid (the web's Tailwind spacing). Screen gutters are `lg` (16). */
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/**
 * Corner radii from the web scale (`--radius` 10 px). Always continuous corners
 * (`borderCurve: "continuous"`). Buttons and badges are capsules.
 */
export const Radius = {
  /** Month grid days, focus outlines. */
  small: 6,
  /** Chips with square corners, such as the key badge. */
  medium: 8,
  /** Controls and skeleton controls. */
  control: 10,
  /** Plan date tile. */
  tile: 14,
  /** Panels nested inside cards; skeleton blocks. */
  inner: 18,
  /** Cards on iPhone (web `max-md:rounded-3xl`). */
  card: 22,
  /** Cards on iPad and wide layouts (web `rounded-4xl`). */
  cardWide: 26,
  /** Large enough to make any control a capsule. */
  capsule: 999,
} as const;

/** Fixed sizes shared by components. */
export const Metrics = {
  /** Minimum tap target and row height. */
  minimumTapTarget: 44,
  /** Status dot diameter (web `size-2.5`). */
  statusDot: 10,
  /** Ring around a status dot that cuts it out of the avatar (web `ring-2`). */
  statusDotRing: 2,
  /** Thickness of a capsule meter (fit score, people meters, progress). */
  meterHeight: 4,
  /** Full-width bottom action height on iPhone (web `h-11`). */
  bottomActionHeight: 50,
  /** One device pixel. */
  hairline: StyleSheet.hairlineWidth,
  /** The plan date tile's width at the default text size. */
  dateTileWidth: 48,
} as const;
