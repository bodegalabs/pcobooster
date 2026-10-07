import { useState } from "react";
import { Modal, StyleSheet, TextInput, View } from "react-native";

import { failureMessage } from "../../app-shell/queries";
import { useSession } from "../../app-shell/session";
import { BottomActionBar } from "../../components/bottom-action-bar";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { demoKeyFromText } from "../../session/app-link";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  input: {
    backgroundColor: colors.surfaceCard,
    color: colors.ink,
    padding: Spacing.lg,
    borderRadius: 12,
  },
  space: { flex: 1 },
});

export const DemoLinkSheet = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const session = useSession();
  const [text, setText] = useState("");
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = demoKeyFromText(text);
  const open = async () => {
    if (key === null || opening) {
      return;
    }
    setOpening(true);
    setMessage(null);
    try {
      await session.startDemo(key);
      onClose();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? failureMessage(error)
          : "Couldn't open the demo."
      );
    }
    setOpening(false);
  };
  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <AppText font="pageTitle">Open a Demo</AppText>
        <AppText font="rowDetail">
          Paste your demo link or key. Explore a read-only demo.
        </AppText>
        <TextInput
          accessibilityLabel="Demo link or key"
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Demo link or key"
          placeholderTextColor={colors.inkTertiary}
          style={styles.input}
        />
        {message === null ? null : (
          <AppText font="rowDetail" color={colors.destructive}>
            {message}
          </AppText>
        )}
        <View style={styles.space} />
        <BottomActionBar
          actions={[
            {
              title: "Open Demo",
              disabled: key === null || opening,
              isBusy: opening,
              onPress: () => {
                void open();
              },
            },
            { title: "Cancel", onPress: onClose },
          ]}
        />
      </View>
    </Modal>
  );
};
