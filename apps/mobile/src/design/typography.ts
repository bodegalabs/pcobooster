import type { TextProps, TextStyle } from "react-native";

type DynamicTypeRamp = NonNullable<TextProps["dynamicTypeRamp"]>;
export type FontWeight = "regular" | "medium" | "semibold" | "bold";

interface TextStyleMetrics {
  readonly fontSize: number;
  /** The style's leading: SwiftUI spaces wrapped lines by it. */
  readonly lineHeight: number;
  /** The UIFontMetrics curve the style scales on with Dynamic Type. */
  readonly ramp: DynamicTypeRamp;
  readonly weight: FontWeight;
}

/**
 * SwiftUI text styles at the default (Large) content size. Each scales on its own Dynamic Type
 * curve (`dynamicTypeRamp` uses `UIFontMetrics`), as SwiftUI text styles do.
 */
export const textStyles = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    ramp: "largeTitle",
    weight: "regular",
  },
  title: { fontSize: 28, lineHeight: 34, ramp: "title1", weight: "regular" },
  title2: { fontSize: 22, lineHeight: 28, ramp: "title2", weight: "regular" },
  title3: { fontSize: 20, lineHeight: 25, ramp: "title3", weight: "regular" },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    ramp: "headline",
    weight: "semibold",
  },
  body: { fontSize: 17, lineHeight: 22, ramp: "body", weight: "regular" },
  callout: { fontSize: 16, lineHeight: 21, ramp: "callout", weight: "regular" },
  subheadline: {
    fontSize: 15,
    lineHeight: 20,
    ramp: "subheadline",
    weight: "regular",
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    ramp: "footnote",
    weight: "regular",
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    ramp: "caption1",
    weight: "regular",
  },
  caption2: {
    fontSize: 11,
    lineHeight: 13,
    ramp: "caption2",
    weight: "regular",
  },
} as const satisfies Record<string, TextStyleMetrics>;

export type TextStyleName = keyof typeof textStyles;

export const fontWeights: Record<
  FontWeight,
  NonNullable<TextStyle["fontWeight"]>
> = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
};

/**
 * The product type scale, mapped from the web hierarchy onto SwiftUI text styles (the Swift
 * app's `Font` extensions). Everything is a text style, so everything follows Dynamic Type.
 */
export const fonts = {
  /** Sign-in and empty-state headlines. */
  heroTitle: { style: "title", weight: "semibold" },
  /** Inline page titles when a navigation title is not used. */
  pageTitle: { style: "title2", weight: "semibold" },
  /** Card and sheet section titles. */
  cardTitle: { style: "headline" },
  /** Primary row text: names, song titles, positions. */
  rowTitle: { style: "body" },
  /** Emphasized row text. */
  rowTitleEmphasized: { style: "body", weight: "medium" },
  /** Second line of a row and supporting copy. */
  rowDetail: { style: "subheadline" },
  /** Metadata: dates, counts, hints. */
  meta: { style: "footnote" },
  /** Quiet section labels: sentence case, medium weight, secondary ink. */
  sectionLabel: { style: "subheadline", weight: "medium" },
  /** Badge and chip labels. */
  badgeLabel: { style: "caption", weight: "medium" },
  /** Small caps labels such as "DECLINED" (uppercase and tracked by `capsLabelStyle`). */
  capsLabel: { style: "caption2", weight: "semibold" },
} as const satisfies Record<
  string,
  { style: TextStyleName; weight?: FontWeight }
>;

export type FontName = keyof typeof fonts;

/** Uppercase, slightly tracked caps label (Swift `capsLabelStyle()`). */
export const capsLabelStyle = {
  letterSpacing: 0.6,
  textTransform: "uppercase",
} as const;

const isFontName = (font: FontName | TextStyleName): font is FontName =>
  font in fonts;

interface ResolvedFont {
  readonly metrics: TextStyleMetrics;
  readonly weight: FontWeight;
}

export const resolveFont = (
  font: FontName | TextStyleName,
  weight?: FontWeight
): ResolvedFont => {
  if (isFontName(font)) {
    const named: { style: TextStyleName; weight?: FontWeight } = fonts[font];
    const metrics: TextStyleMetrics = textStyles[named.style];
    return { metrics, weight: weight ?? named.weight ?? metrics.weight };
  }
  const metrics: TextStyleMetrics = textStyles[font];
  return { metrics, weight: weight ?? metrics.weight };
};

/** The point size of a font at the default text size, for symbols sized beside text. */
export const fontSize = (font: FontName | TextStyleName): number =>
  resolveFont(font).metrics.fontSize;
