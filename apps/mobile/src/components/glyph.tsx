import { Host, Image as SwiftImage } from "@expo/ui/swift-ui";
import { SymbolView } from "expo-symbols";
import type { SymbolWeight } from "expo-symbols";
import { View } from "react-native";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";

import { AppSymbol } from "../design/symbols";
import type { AppSymbolName, SymbolSource } from "../design/symbols";

export interface GlyphProps {
  readonly symbol: AppSymbolName;
  /** The square box the symbol is fitted into. */
  readonly size: number;
  /** Overrides the box width, for narrow glyphs such as chevrons beside text. */
  readonly width?: number;
  readonly height?: number;
  readonly color: ColorValue;
  readonly weight?: SymbolWeight;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
}

/**
 * An SF Symbol (expo-symbols) or a custom symbol from the asset catalog. React Native's `Image`
 * cannot load a `.symbolset`, so custom symbols render through SwiftUI `Image(assetName:)` in a
 * hosting view. Unlike SwiftUI's `Image(systemName:)` beside text, a symbol view has no size from
 * a font, so every call site passes the box it fills. Decorative unless labeled.
 */
export const Glyph = ({
  symbol,
  size,
  width,
  height,
  color,
  weight,
  style,
  accessibilityLabel,
}: GlyphProps) => {
  const source: SymbolSource = AppSymbol[symbol];
  const box = { width: width ?? size, height: height ?? size };
  const isDecorative = accessibilityLabel === undefined;
  if ("asset" in source) {
    return (
      <View
        accessibilityElementsHidden={isDecorative}
        accessibilityLabel={accessibilityLabel}
        accessible={!isDecorative}
        importantForAccessibility={
          isDecorative ? "no-hide-descendants" : "auto"
        }
        pointerEvents="none"
        style={[box, style]}
      >
        <Host style={box}>
          <SwiftImage assetName={source.asset} color={color} size={size} />
        </Host>
      </View>
    );
  }
  return (
    <SymbolView
      accessibilityElementsHidden={isDecorative}
      accessibilityLabel={accessibilityLabel}
      name={source.sf}
      resizeMode="scaleAspectFit"
      style={[box, style]}
      tintColor={color}
      weight={weight}
    />
  );
};
