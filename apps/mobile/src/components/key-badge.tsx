import { StyleSheet, View } from "react-native";

import { AppText } from "../design/app-text";
import { colors } from "../design/colors";
import { Radius, Spacing } from "../design/metrics";
import { fontSize } from "../design/typography";
import { displayKey, spokenKey } from "../lib/song-keys";
import { Glyph } from "./glyph";

const ARROW_SCALE = 0.75;

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.hairline,
    borderRadius: Radius.capsule,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    minHeight: 22,
    minWidth: 28,
    paddingHorizontal: Spacing.sm,
  },
});

type KeyBadgeProps =
  | { readonly songKey: string | null }
  | { readonly from: string; readonly to: string };

const keysOf = (props: KeyBadgeProps): readonly string[] => {
  if ("from" in props) {
    return [props.from, props.to];
  }
  return props.songKey === null ? [] : [props.songKey];
};

const accessibilityLabelOf = (keys: readonly string[]): string => {
  const [first, second] = keys;
  if (first === undefined) {
    return "No key";
  }
  if (second === undefined) {
    return `Key ${spokenKey(first)}`;
  }
  return `Key change from ${spokenKey(first)} to ${spokenKey(second)}`;
};

/**
 * A song's musical key as a quiet outlined chip ("G", "B♭", "F♯m"), or a key change "G → A".
 * A missing key shows "No key" in pending amber. Facts only: never color a key by how well it
 * fits (inform, don't recommend).
 */
export const KeyBadge = (props: KeyBadgeProps) => {
  const keys = keysOf(props);
  const [first, second] = keys;
  return (
    <View
      accessibilityLabel={accessibilityLabelOf(keys)}
      accessible
      style={styles.badge}
    >
      {first === undefined ? (
        <AppText
          color={colors.statusPendingText}
          font="badgeLabel"
          numberOfLines={1}
        >
          No key
        </AppText>
      ) : (
        <>
          <AppText font="badgeLabel" numberOfLines={1}>
            {displayKey(first)}
          </AppText>
          {second === undefined ? null : (
            <>
              <Glyph
                color={colors.inkTertiary}
                size={fontSize("badgeLabel") * ARROW_SCALE}
                symbol="arrowRight"
              />
              <AppText font="badgeLabel" numberOfLines={1}>
                {displayKey(second)}
              </AppText>
            </>
          )}
        </>
      )}
    </View>
  );
};
