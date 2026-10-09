import { PORTRAIT_SAFE, useFormat } from "./format";
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

export const useFeatureLayout = (): FeatureLayout =>
  useFormat() === "portrait" ? PORTRAIT : LANDSCAPE;

/** Display size for full-screen statement cards. */
export const useStatementSize = (): number =>
  useFormat() === "portrait" ? 96 : 124;
