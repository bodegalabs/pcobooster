import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  DynamicColorIOS,
  useColorScheme,
} from "react-native";
import type { ColorValue } from "react-native";

import { colorTokens, mapColorTokens } from "./colors.generated";
import type { ColorTokenName, ColorTokenValue, Rgba } from "./colors.generated";

export type { ColorTokenName } from "./colors.generated";

const ALPHA_PRECISION = 1000;

const rgbaString = ([red, green, blue, alpha]: Rgba, opacity: number): string =>
  `rgba(${red}, ${green}, ${blue}, ${Math.round(alpha * opacity * ALPHA_PRECISION) / ALPHA_PRECISION})`;

export type ColorVariant =
  | "light"
  | "dark"
  | "highContrastLight"
  | "highContrastDark";

/** The token's value for one appearance, falling back the way the asset catalog does. */
const variantValue = (token: ColorTokenValue, variant: ColorVariant): Rgba => {
  const dark = token.dark ?? token.light;
  switch (variant) {
    case "light": {
      return token.light;
    }
    case "dark": {
      return dark;
    }
    case "highContrastLight": {
      return token.highContrastLight ?? token.light;
    }
    case "highContrastDark": {
      return token.highContrastDark ?? dark;
    }
    default: {
      return variant satisfies never;
    }
  }
};

/**
 * A token as a native dynamic color (light, dark, and Increase Contrast), like SwiftUI's
 * `Color("Colors/<Name>")`. `opacity` multiplies the token's own alpha, like `.opacity(_:)`.
 */
export const tokenColor = (name: ColorTokenName, opacity = 1): ColorValue => {
  const token: ColorTokenValue = colorTokens[name];
  return DynamicColorIOS({
    light: rgbaString(variantValue(token, "light"), opacity),
    dark: rgbaString(variantValue(token, "dark"), opacity),
    highContrastLight: rgbaString(
      variantValue(token, "highContrastLight"),
      opacity
    ),
    highContrastDark: rgbaString(
      variantValue(token, "highContrastDark"),
      opacity
    ),
  });
};

/** A token resolved for one appearance, as a plain `rgba()` string. */
export const resolvedTokenColor = (
  name: ColorTokenName,
  variant: ColorVariant,
  opacity = 1
): string => rgbaString(variantValue(colorTokens[name], variant), opacity);

/** Every token as a dynamic color: `colors.surfaceCanvas`, `colors.inkSecondary`. */
export const colors: Record<ColorTokenName, ColorValue> = mapColorTokens(
  (name) => tokenColor(name)
);

/** Every token name, in catalog order. */
export const allColorTokenNames: readonly ColorTokenName[] = Object.values(
  mapColorTokens((name) => name)
);

/**
 * The appearance tokens resolve to right now. SwiftUI hosts (`@expo/ui`) take plain colors, so
 * views that pass tokens into SwiftUI resolve them with this and `resolvedTokenColor`.
 */
export const useColorVariant = (): ColorVariant => {
  const scheme = useColorScheme();
  const [highContrast, setHighContrast] = useState(false);
  useEffect(() => {
    let isMounted = true;
    const readInitial = async () => {
      const enabled = await AccessibilityInfo.isDarkerSystemColorsEnabled();
      if (isMounted) {
        setHighContrast(enabled);
      }
    };
    void readInitial();
    const subscription = AccessibilityInfo.addEventListener(
      "darkerSystemColorsChanged",
      setHighContrast
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);
  const isDark = scheme === "dark";
  if (highContrast) {
    return isDark ? "highContrastDark" : "highContrastLight";
  }
  return isDark ? "dark" : "light";
};
