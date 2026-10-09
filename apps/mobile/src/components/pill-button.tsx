import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import type { ColorValue } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { AppText } from "../design/app-text";
import { colors, tokenColor } from "../design/colors";
import { Metrics, Radius, Spacing } from "../design/metrics";
import { CssCurves } from "../design/motion";
import { Motion } from "../design/motion-tokens";
import type { AppSymbolName } from "../design/symbols";
import { fontSize } from "../design/typography";
import type { FontName, FontWeight, TextStyleName } from "../design/typography";
import { Glyph } from "./glyph";

export type PillKind = "primary" | "secondary" | "outline" | "destructive";
export type PillSize = "small" | "regular" | "large";

const sizes: Record<
  PillSize,
  {
    readonly minHeight: number;
    readonly paddingHorizontal: number;
    readonly font: FontName | TextStyleName;
    readonly weight: FontWeight;
  }
> = {
  /** 28 pt, inline row actions. */
  small: {
    minHeight: 28,
    paddingHorizontal: Spacing.md,
    font: "subheadline",
    weight: "medium",
  },
  /** 36 pt (web default `h-9`). */
  regular: {
    minHeight: 36,
    paddingHorizontal: Spacing.lg,
    font: "subheadline",
    weight: "medium",
  },
  /** 50 pt, full-width bottom actions on iPhone. */
  large: {
    minHeight: Metrics.bottomActionHeight,
    paddingHorizontal: Spacing.xl,
    font: "body",
    weight: "semibold",
  },
};

const PRESSED_PRIMARY_OPACITY = 0.85;
const DESTRUCTIVE_FILL_OPACITY = 0.1;
const DESTRUCTIVE_PRESSED_OPACITY = 0.2;
const DISABLED_OPACITY = 0.5;
const PRESSED_SCALE = 0.98;
/** Icon beside the title, `imageScale(.small)`. */
const ICON_SCALE = 0.8;

const foreground: Record<PillKind, ColorValue> = {
  primary: colors.onInkFill,
  secondary: colors.ink,
  outline: colors.ink,
  destructive: colors.destructive,
};

const background = (kind: PillKind, pressed: boolean): ColorValue => {
  switch (kind) {
    case "primary": {
      return pressed
        ? tokenColor("inkFill", PRESSED_PRIMARY_OPACITY)
        : colors.inkFill;
    }
    case "secondary": {
      return pressed ? colors.surfaceHighlight : colors.surfaceSecondary;
    }
    case "outline": {
      return pressed ? colors.surfaceHighlight : "transparent";
    }
    case "destructive": {
      return tokenColor(
        "destructive",
        pressed ? DESTRUCTIVE_PRESSED_OPACITY : DESTRUCTIVE_FILL_OPACITY
      );
    }
    default: {
      return kind satisfies never;
    }
  }
};

const styles = StyleSheet.create({
  pill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderCurve: "continuous",
    borderRadius: Radius.capsule,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  wide: { alignSelf: "stretch" },
});

interface PillButtonProps {
  readonly title: string;
  readonly onPress: () => void;
  readonly kind?: PillKind;
  readonly size?: PillSize;
  readonly symbol?: AppSymbolName;
  readonly disabled?: boolean;
  /** Full width (bottom actions). */
  readonly wide?: boolean;
  /**
   * Only `symbol`, in a round button as wide as the pill is tall; `title` stays the accessibility
   * label. For compact paired controls such as previous and next.
   */
  readonly iconOnly?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

/**
 * Capsule buttons for the content layer (inside cards, rows, and empty states), matching the web
 * variants: `primary` is the ink pill, `secondary` a quiet sage fill, `outline` a hairline
 * capsule, `destructive` red text on a soft red fill. Floating controls use glass instead
 * (`GlassButton`). Press feedback moves the button; the pressed fill changes instantly.
 */
export const PillButton = ({
  title,
  onPress,
  kind = "primary",
  size = "regular",
  symbol,
  disabled = false,
  wide = false,
  iconOnly = false,
  accessibilityHint,
  testID,
}: PillButtonProps) => {
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReducedMotion();
  const metrics = sizes[size];
  // A round icon button is smaller than a tap target; the slop makes up the difference.
  const slop = iconOnly
    ? Math.max(0, (Metrics.minimumTapTarget - metrics.minHeight) / 2)
    : 0;
  const ink = foreground[kind];
  const isPressed = pressed && !disabled;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={slop}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
      }}
      onPressOut={() => {
        setPressed(false);
      }}
      style={wide ? styles.wide : null}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.pill,
          wide ? styles.wide : null,
          {
            backgroundColor: background(kind, isPressed),
            borderColor: colors.hairline,
            borderWidth: kind === "outline" ? StyleSheet.hairlineWidth : 0,
            minHeight: metrics.minHeight,
            opacity: disabled ? DISABLED_OPACITY : 1,
            paddingHorizontal: iconOnly ? 0 : metrics.paddingHorizontal,
            width: iconOnly ? metrics.minHeight : undefined,
            transform: [
              { translateY: isPressed ? 1 : 0 },
              { scale: isPressed && !reduceMotion ? PRESSED_SCALE : 1 },
            ],
            transitionDuration: reduceMotion ? 0 : Motion.press,
            transitionProperty: "transform",
            transitionTimingFunction: CssCurves.snappy,
          },
        ]}
      >
        {symbol === undefined ? null : (
          <Glyph
            color={ink}
            size={fontSize(metrics.font) * ICON_SCALE}
            symbol={symbol}
            weight="medium"
          />
        )}
        {iconOnly ? null : (
          <AppText
            color={ink}
            font={metrics.font}
            numberOfLines={1}
            weight={metrics.weight}
          >
            {title}
          </AppText>
        )}
      </Animated.View>
    </Pressable>
  );
};
