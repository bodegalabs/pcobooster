import type { ProductApi } from "@pcobooster/client/product-client";
import { useQuery } from "@tanstack/react-query";
import type { Effect } from "effect";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { useProductClient } from "../../app-shell/queries";
import { BottomActionBar } from "../../components/bottom-action-bar";
import { PersonAvatar } from "../../components/person-avatar";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { ReadStatus } from "../plan/read-status";
import { assignReads } from "./reads";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  input: {
    color: colors.ink,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    fontSize: 17,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: colors.surfaceCard,
    borderRadius: 18,
  },
});
export const SomeoneElse = ({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (
    person: Effect.Success<ReturnType<ProductApi["people"]["search"]>>[number]
  ) => void;
}) => {
  const context = useProductClient();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(text.trim());
    }, 150);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  const results = useQuery({
    ...assignReads.search(context, debounced),
    enabled: visible && debounced.length >= 2,
  });
  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root} testID="assign-someone-else-sheet">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 12 }}
        >
          <AppText font="pageTitle">Someone Else</AppText>
          <TextInput
            accessibilityLabel="Search people"
            testID="assign-search-people"
            placeholder="Search people"
            placeholderTextColor={colors.inkTertiary}
            value={text}
            onChangeText={setText}
            maxLength={80}
            style={styles.input}
            autoFocus
          />
          {text.trim().length < 2 ? (
            <AppText font="rowDetail" color={colors.inkSecondary}>
              Type at least 2 characters.
            </AppText>
          ) : (
            <ReadStatus
              error={results.error}
              retry={() => {
                void results.refetch();
              }}
            />
          )}
          {debounced !== text.trim() || results.data === undefined
            ? null
            : results.data.map((person) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${person.fullName}`}
                  key={person.id}
                  style={styles.row}
                  onPress={() => {
                    onPick(person);
                    onClose();
                  }}
                >
                  <PersonAvatar
                    name={person.fullName}
                    photoUrl={person.photoThumbnailUrl}
                  />
                  <AppText font="rowTitleEmphasized">{person.fullName}</AppText>
                </Pressable>
              ))}
          {results.data?.length === 0 ? (
            <AppText font="rowDetail">No people found.</AppText>
          ) : null}
        </ScrollView>
        <BottomActionBar
          actions={[
            {
              title: "Close",
              role: "secondary",
              onPress: onClose,
              testID: "assign-search-close",
            },
          ]}
        />
      </View>
    </Modal>
  );
};
