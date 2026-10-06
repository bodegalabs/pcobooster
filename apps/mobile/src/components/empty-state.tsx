import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "../design/app-text";
import { colors } from "../design/colors";
import { Radius, Spacing } from "../design/metrics";
import type { AppSymbolName } from "../design/symbols";
import { Glyph } from "./glyph";
import { RocketMark } from "./rocket-mark";

const ARTWORK_SIZE = 56;
const SYMBOL_SIZE = 28;

const styles = StyleSheet.create({
  actions: { alignItems: "center", gap: Spacing.sm, marginTop: Spacing.sm },
  artwork: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderCurve: "continuous",
    borderRadius: Radius.tile,
    height: ARTWORK_SIZE,
    justifyContent: "center",
    width: ARTWORK_SIZE,
  },
  container: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  heading: { alignItems: "center", gap: Spacing.md },
  text: { textAlign: "center" },
});

interface EmptyStateProps {
  readonly title: string;
  /** A quiet symbol in secondary ink, or the rocket for "all set" moments. */
  readonly artwork: AppSymbolName | "rocket-mark";
  readonly description?: string;
  /** One or two pill buttons. */
  readonly actions?: ReactNode;
}

/**
 * An empty or unavailable state (`ContentUnavailableView` in the Swift app): a quiet symbol, a
 * short title, one line of description, and at most one or two actions. Few words.
 */
export const EmptyState = ({
  title,
  artwork,
  description,
  actions,
}: EmptyStateProps) => (
  <View style={styles.container}>
    <View style={styles.heading}>
      {artwork === "rocket-mark" ? (
        <RocketMark size={ARTWORK_SIZE} />
      ) : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.artwork}
        >
          <Glyph
            color={colors.inkSecondary}
            size={SYMBOL_SIZE}
            symbol={artwork}
          />
        </View>
      )}
      <AppText accessibilityRole="header" font="cardTitle" style={styles.text}>
        {title}
      </AppText>
    </View>
    {description === undefined ? null : (
      <AppText color={colors.inkSecondary} font="rowDetail" style={styles.text}>
        {description}
      </AppText>
    )}
    {actions === undefined ? null : (
      <View style={styles.actions}>{actions}</View>
    )}
  </View>
);
