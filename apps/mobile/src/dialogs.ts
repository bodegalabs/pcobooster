import { Alert } from "react-native";

export const confirmRemove = (label: string, remove: () => void): void => {
  Alert.alert(`Remove ${label}?`, "This changes the plan in Planning Center.", [
    { text: "Keep", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: remove },
  ]);
};
