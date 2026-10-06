import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Spacing } from "../design/metrics";
import { GlassButtonStack } from "./glass-button";
import type { GlassAction } from "./glass-button";

const styles = StyleSheet.create({
  bar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
});

interface BottomActionBarProps {
  /** Primary first. Destructive actions such as Remove are full-width buttons too. */
  readonly actions: readonly GlassAction[];
}

/**
 * Sheet and dialog actions. On iPhone they stack as full-width glass buttons pinned to the bottom
 * of the sheet, destructive ones included (product rule). Pin it with the screen's
 * `unstable_sheetFooter` option, or place it last in a sheet's layout.
 */
export const BottomActionBar = ({ actions }: BottomActionBarProps) => {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, Spacing.sm) },
      ]}
    >
      <GlassButtonStack actions={actions} />
    </View>
  );
};
