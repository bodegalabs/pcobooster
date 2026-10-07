import { Pressable, StyleSheet, View } from "react-native";

import { Glyph } from "../../components/glyph";
import { PillButton } from "../../components/pill-button";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { DEFAULT_WINDOW, windowFooter, windowTitle } from "./agenda";
import type { ServicesAgenda } from "./use-services-agenda";

const SUMMARY_MIN_HEIGHT = 36;

const styles = StyleSheet.create({
  footer: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  summary: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    minHeight: SUMMARY_MIN_HEIGHT,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  footerText: { textAlign: "center" },
  summaryText: { flex: 1 },
});

/**
 * What the agenda is narrowed to when it isn't the default ("Next 14 days · Youth Night"), with
 * a way back. Quiet, like a Mail filter bar.
 */
export const AgendaFilterSummary = ({ agenda }: { agenda: ServicesAgenda }) => {
  const parts = [
    agenda.window === DEFAULT_WINDOW ? null : windowTitle[agenda.window],
    agenda.selectsAllServiceTypes ? null : agenda.serviceTypeSummary,
  ].filter((part) => part !== null);
  return (
    <View style={styles.summary} testID="services-filter-summary">
      <Glyph color={colors.inkTertiary} size={13} symbol="filter" />
      <AppText
        color={colors.inkSecondary}
        font="footnote"
        numberOfLines={2}
        style={styles.summaryText}
        weight="medium"
      >
        {parts.join(" · ")}
      </AppText>
      <Pressable
        accessibilityLabel="Reset filters"
        accessibilityRole="button"
        hitSlop={Spacing.sm}
        onPress={() => {
          agenda.resetFilters();
        }}
      >
        <AppText font="footnote" weight="semibold">
          Reset
        </AppText>
      </Pressable>
    </View>
  );
};

/** The end of the agenda: which window it covers, and the next step out of it. */
export const AgendaWindowFooter = ({ agenda }: { agenda: ServicesAgenda }) => {
  const footer = windowFooter(agenda.window);
  if (footer === null) {
    return null;
  }
  return (
    <View style={styles.footer}>
      <AppText
        color={colors.inkTertiary}
        font="footnote"
        style={styles.footerText}
      >
        {footer.text}
      </AppText>
      <PillButton
        kind="outline"
        onPress={() => {
          agenda.setWindow(footer.action.window);
        }}
        size="small"
        title={footer.action.title}
      />
    </View>
  );
};
