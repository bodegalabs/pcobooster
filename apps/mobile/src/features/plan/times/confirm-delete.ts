import { Alert } from "react-native";

/** The one delete confirmation for a time, from its editor, swipe, or context menu. */
export const requestTimeDelete = (onDelete: () => void): void => {
  Alert.alert(
    "Delete time?",
    "Remove this time from the plan? Any assignments tied to it will also lose this time.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete time", style: "destructive", onPress: onDelete },
    ]
  );
};
