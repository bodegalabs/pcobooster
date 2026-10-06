import { StyleSheet, View } from "react-native";
import type { ColorValue } from "react-native";

import { colors } from "../design/colors";

interface HairlineProps {
  /** Leading inset, to align with row text. */
  readonly inset?: number;
  readonly trailing?: number;
  readonly color?: ColorValue;
  readonly axis?: "horizontal" | "vertical";
}

/** A one-device-pixel line in a hairline token (Swift `Hairline`). */
export const Hairline = ({
  inset = 0,
  trailing = 0,
  color = colors.hairline,
  axis = "horizontal",
}: HairlineProps) => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={
      axis === "horizontal"
        ? {
            backgroundColor: color,
            height: StyleSheet.hairlineWidth,
            marginLeft: inset,
            marginRight: trailing,
          }
        : {
            alignSelf: "stretch",
            backgroundColor: color,
            width: StyleSheet.hairlineWidth,
          }
    }
  />
);
