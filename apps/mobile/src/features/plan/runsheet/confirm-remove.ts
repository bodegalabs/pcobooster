import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { Alert } from "react-native";

import { itemTitle } from "./formatting";

/** The one remove confirmation for an item, from its editor, swipe, or context menu. */
export const requestItemRemove = (
  item: PlanItem,
  onRemove: () => void
): void => {
  Alert.alert(
    `Remove "${itemTitle(item)}"?`,
    "It comes off this plan in Planning Center.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: onRemove },
    ]
  );
};
