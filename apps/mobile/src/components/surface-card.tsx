import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { StyleSheet, View, useColorScheme } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { colors } from "../design/colors";
import type { ColorTokenName } from "../design/colors";
import { Radius, Spacing } from "../design/metrics";

/**
 * The solid surface token behind the current content (Swift `\.surfaceColor`), so status dots
 * cut out of avatars and skeleton shimmers match it. The canvas by default; cards provide
 * `surfaceCard`.
 */
const SurfaceColorContext = createContext<ColorTokenName>("surfaceCanvas");

/** Tells content inside a custom solid surface which token it sits on. */
export const SurfaceColorProvider = ({
  value,
  children,
}: {
  value: ColorTokenName;
  children: ReactNode;
}) => <SurfaceColorContext value={value}>{children}</SurfaceColorContext>;

export const useSurfaceColor = (): ColorTokenName =>
  useContext(SurfaceColorContext);

const paddings = { regular: Spacing.lg, compact: Spacing.md, none: 0 } as const;

/** Shadow opacity per appearance (Swift: black at 5% light, 24% dark, radius 3, y 1). */
const SHADOW_OPACITY = { light: 0.05, dark: 0.24 } as const;

interface SurfaceCardProps {
  readonly children: ReactNode;
  /** 16 pt by default, 12 for dense cards, none for rows that run edge to edge. */
  readonly padding?: keyof typeof paddings;
  /** Outer layout: margins, width. */
  readonly style?: StyleProp<ViewStyle>;
  /** Inner layout: direction, alignment, gaps. */
  readonly contentStyle?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  shadow: {
    borderCurve: "continuous",
    borderRadius: Radius.card,
  },
  surface: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.hairlineSubtle,
    borderCurve: "continuous",
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});

/**
 * The solid content surface: card fill, 22 pt continuous corners, a faint hairline ring, and a
 * very soft shadow, like the web `Card`. Cards are content, never glass. The shadow sits on an
 * outer view so the inner one can clip pressed-row fills to the corners.
 */
export const SurfaceCard = ({
  children,
  padding = "regular",
  style,
  contentStyle,
}: SurfaceCardProps) => {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <View
      style={[
        styles.shadow,
        { boxShadow: `0px 1px 7px rgba(0, 0, 0, ${SHADOW_OPACITY[scheme]})` },
        style,
      ]}
    >
      <View
        style={[styles.surface, { padding: paddings[padding] }, contentStyle]}
      >
        <SurfaceColorProvider value="surfaceCard">
          {children}
        </SurfaceColorProvider>
      </View>
    </View>
  );
};
