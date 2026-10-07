import { Stack } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";

import { EmptyState } from "../components/empty-state";
import { colors } from "../design/colors";
import type { AppSymbolName } from "../design/symbols";
import { accountHeaderItem } from "./account-button";

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center" },
  scroll: { backgroundColor: colors.surfaceCanvas },
});

/** A tab root whose screens arrive in a later layer: the shell, the account button, a note. */
export const UpcomingTab = ({
  symbol,
  title,
  description,
}: {
  symbol: AppSymbolName;
  title: string;
  description: string;
}) => (
  <>
    <Stack.Screen
      options={{ unstable_headerRightItems: () => [accountHeaderItem()] }}
    />
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.scroll}
    >
      <EmptyState artwork={symbol} description={description} title={title} />
    </ScrollView>
  </>
);
