import { PORTRAIT_SAFE, useFormat } from "./format";
import type { Format } from "./format";
import type { Box } from "./product-stage";

/**
 * Where a feature scene puts its caption and its product window. Landscape stacks a
 * headline over a wide app window; portrait keeps the headline inside the top safe line
 * and gives the phone-width replica most of the height.
 */
export interface FeatureLayout {
  readonly headlineTop: number;
  readonly headlineSize: number;
  readonly headlineWidth: number;
  readonly product: Box;
  readonly nativeWidth: number;
  readonly nativeHeight: number;
}

const LANDSCAPE: FeatureLayout = {
  headlineTop: 64,
  headlineSize: 64,
  headlineWidth: 1500,
  product: { left: 240, top: 262, width: 1440 },
  nativeWidth: 1280,
  nativeHeight: 680,
};

const PORTRAIT: FeatureLayout = {
  headlineTop: PORTRAIT_SAFE.top + 10,
  headlineSize: 78,
  headlineWidth: 960,
  product: { left: 50, top: 580, width: 980 },
  nativeWidth: 720,
  nativeHeight: 760,
};

/**
 * 4:5 keeps the desktop replica (wider than its 760px phone breakpoint) at full size, so
 * a camera zoom on the action reads on a phone held upright in a feed.
 */
const FEED: FeatureLayout = {
  headlineTop: 84,
  headlineSize: 70,
  headlineWidth: 980,
  product: { left: 40, top: 290, width: 1000 },
  nativeWidth: 1000,
  nativeHeight: 1010,
};

const LAYOUTS = {
  landscape: LANDSCAPE,
  portrait: PORTRAIT,
  feed: FEED,
} as const satisfies Record<Format, FeatureLayout>;

export const useFeatureLayout = (): FeatureLayout => LAYOUTS[useFormat()];

/** Display size for full-screen statement cards. */
export const useStatementSize = (): number =>
  useFormat() === "landscape" ? 124 : 96;
