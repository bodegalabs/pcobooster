import { Stack } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";

import { EmptyState } from "../../../../../src/components/empty-state";
import { colors } from "../../../../../src/design/colors";

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center" },
  scroll: { backgroundColor: colors.surfaceCanvas },
});

/** The plan screen's place in the Services stack; its segments arrive in the next layer. */
const PlanScreen = () => (
  <>
    <Stack.Screen options={{ title: "Plan" }} />
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.scroll}
    >
      <EmptyState
        artwork="plan"
        description="Overview, Lineup, Plan, and Times arrive in the next layer."
        title="Plan"
      />
    </ScrollView>
  </>
);

export default PlanScreen;
