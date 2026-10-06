import { StyleSheet } from "react-native";

import { colors } from "../../design/colors";
import { Radius, Spacing } from "../../design/metrics";

const MONO = "Menlo";
const SWATCH_HEIGHT = 52;
const SWATCH_MIN_WIDTH = 104;
const RADIUS_SAMPLE = 64;
const SYMBOL_CELL = 76;

export const galleryStyles = StyleSheet.create({
  caption: { color: colors.inkTertiary, fontFamily: MONO, fontSize: 11 },
  column: { gap: Spacing.md },
  flow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  group: { gap: Spacing.sm },
  label: { color: colors.inkSecondary, fontFamily: MONO, fontSize: 11 },
  metricBar: {
    backgroundColor: colors.statusInfo,
    borderRadius: Radius.capsule,
    height: 6,
    opacity: 0.7,
  },
  metricRow: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  metricName: { width: 40 },
  radius: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.hairline,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    height: RADIUS_SAMPLE,
    width: RADIUS_SAMPLE,
  },
  radiusItem: { alignItems: "center", gap: 6 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
  },
  rowSpread: { flex: 1 },
  section: { gap: Spacing.lg },
  spaced: { alignItems: "center", flexDirection: "row", gap: Spacing.lg },
  swatch: {
    borderColor: colors.hairlineSubtle,
    borderCurve: "continuous",
    borderRadius: Radius.tile,
    borderWidth: StyleSheet.hairlineWidth,
    height: SWATCH_HEIGHT,
  },
  swatchCell: { flexBasis: SWATCH_MIN_WIDTH, flexGrow: 1, gap: 6 },
  symbolCell: { alignItems: "center", gap: 6, width: SYMBOL_CELL },
  symbolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: Spacing.md,
  },
});
