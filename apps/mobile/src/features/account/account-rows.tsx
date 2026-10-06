import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SectionHeader } from "../../components/section-header";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Metrics, Spacing } from "../../design/metrics";

/** SwiftUI's inset grouped list rows are a little taller than card rows elsewhere. */
export const LIST_ROW_PADDING = 15;
export const AVATAR_LARGE = 40;

const styles = StyleSheet.create({
  footer: { paddingHorizontal: Spacing.lg },
  header: { paddingHorizontal: Spacing.lg },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    minHeight: Metrics.minimumTapTarget,
    paddingHorizontal: Spacing.lg,
    paddingVertical: LIST_ROW_PADDING,
  },
  section: { gap: Spacing.sm },
});

/** One section of the account sheet: a quiet header, a card of rows, and a footnote. */
export const AccountSection = ({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string | null;
  children: ReactNode;
}) => (
  <View style={styles.section}>
    {title === undefined ? null : (
      <View style={styles.header}>
        <SectionHeader title={title} />
      </View>
    )}
    <SurfaceCard padding="none">{children}</SurfaceCard>
    {footer === undefined || footer === null ? null : (
      <View style={styles.footer}>
        <AppText color={colors.inkSecondary} font="meta">
          {footer}
        </AppText>
      </View>
    )}
  </View>
);

/** A tappable list row; its fill changes instantly on press. */
export const AccountRow = ({
  onPress,
  onLongPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  selected,
  testID,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: "button" | "link";
  selected?: boolean;
  testID?: string;
  children: ReactNode;
}) => (
  <Pressable
    accessibilityHint={accessibilityHint}
    accessibilityLabel={accessibilityLabel}
    accessibilityRole={accessibilityRole}
    accessibilityState={{ disabled, selected }}
    disabled={disabled || (onPress === undefined && onLongPress === undefined)}
    onLongPress={onLongPress}
    onPress={onPress}
    style={({ pressed }) => [
      styles.row,
      pressed ? { backgroundColor: colors.surfaceHighlight } : null,
    ]}
    testID={testID}
  >
    {children}
  </Pressable>
);
