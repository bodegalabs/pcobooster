import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { BottomActionBar } from "../../components/bottom-action-bar";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";

export const AddPositionSheet = ({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string) => void;
}) => {
  const [name, setName] = useState("");
  const add = () => {
    if (name.trim() !== "") {
      onAdd(name);
    }
  };
  return (
    <Modal
      visible
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
          <AppText font="pageTitle">Add Position</AppText>
          <AppText font="rowDetail" color={colors.inkSecondary}>
            For this plan only. Planning Center creates it when you schedule
            someone.
          </AppText>
          <TextInput
            accessibilityLabel="Position name"
            testID="assign-position-name"
            value={name}
            onChangeText={setName}
            onSubmitEditing={add}
            autoCapitalize="words"
            returnKeyType="done"
            placeholder="Position name"
            placeholderTextColor={colors.inkTertiary}
            style={{
              minHeight: 48,
              padding: 12,
              borderRadius: 14,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.hairline,
              backgroundColor: colors.surfaceCard,
              color: colors.ink,
              fontSize: 17,
            }}
          />
        </View>
        <BottomActionBar
          actions={[
            {
              title: "Add",
              onPress: add,
              disabled: name.trim() === "",
              testID: "assign-position-add",
            },
            { title: "Cancel", role: "secondary", onPress: onClose },
          ]}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
};
