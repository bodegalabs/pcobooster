import { Text } from "react-native";
import type { ColorValue, StyleProp, TextProps, TextStyle } from "react-native";

import { colors } from "./colors";
import { fontWeights, resolveFont } from "./typography";
import type { FontName, FontWeight, TextStyleName } from "./typography";

export interface AppTextProps extends Omit<TextProps, "style"> {
  /** A product font (`rowTitle`) or a raw text style (`footnote`). */
  readonly font: FontName | TextStyleName;
  readonly weight?: FontWeight;
  /** Ink by default. */
  readonly color?: ColorValue;
  /** Tabular digits, so numbers do not jitter as they change. */
  readonly tabular?: boolean;
  readonly style?: StyleProp<TextStyle>;
}

/**
 * `Text` in a SwiftUI text style with Dynamic Type and a token color.
 *
 * SwiftUI sizes a one-line `Text` to the font's natural line height and spaces wrapped lines by
 * the style's leading; React Native applies `lineHeight` to every line, so it is set only when
 * the text may wrap.
 */
export const AppText = ({
  font,
  weight,
  color,
  tabular = false,
  style,
  numberOfLines,
  ...props
}: AppTextProps) => {
  const resolved = resolveFont(font, weight);
  const isSingleLine = numberOfLines === 1;
  return (
    <Text
      allowFontScaling
      dynamicTypeRamp={resolved.metrics.ramp}
      // SwiftUI's standard line breaking avoids one-word last lines; React Native defaults to none.
      lineBreakStrategyIOS="standard"
      numberOfLines={numberOfLines}
      style={[
        {
          color: color ?? colors.ink,
          fontSize: resolved.metrics.fontSize,
          fontWeight: fontWeights[resolved.weight],
          lineHeight: isSingleLine ? undefined : resolved.metrics.lineHeight,
        },
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
      {...props}
    />
  );
};
