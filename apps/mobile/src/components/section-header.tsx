import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "../design/app-text";
import { colors } from "../design/colors";
import { Spacing } from "../design/metrics";

const styles = StyleSheet.create({
  accessory: { marginLeft: "auto" },
  row: { alignItems: "baseline", flexDirection: "row", gap: Spacing.sm },
});

interface SectionHeaderProps {
  readonly title: string;
  readonly count?: number;
  /** A trailing control or label, such as "Filter". */
  readonly accessory?: ReactNode;
}

/**
 * A quiet section label, Linear style: sentence-case medium text in secondary ink with an
 * optional tabular count in tertiary ink, and an optional trailing accessory. No filled bars,
 * no uppercase.
 */
export const SectionHeader = ({
  title,
  count,
  accessory,
}: SectionHeaderProps) => (
  <View
    accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
    accessibilityRole="header"
    accessible
    style={styles.row}
  >
    <AppText color={colors.inkSecondary} font="sectionLabel" numberOfLines={1}>
      {title}
    </AppText>
    {count === undefined ? null : (
      <AppText
        color={colors.inkTertiary}
        font="subheadline"
        numberOfLines={1}
        tabular
      >
        {count}
      </AppText>
    )}
    {accessory === undefined ? null : (
      <View style={styles.accessory}>{accessory}</View>
    )}
  </View>
);
