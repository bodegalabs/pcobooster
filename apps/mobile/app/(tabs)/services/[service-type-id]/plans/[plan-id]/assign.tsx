import { Stack } from "expo-router";

import { EmptyState } from "../../../../../../src/components/empty-state";

const Route = () => (
  <>
    <Stack.Screen options={{ title: "Assign" }} />
    <EmptyState
      artwork="plan"
      title="Assign"
      description="Person assignment will be available here."
    />
  </>
);

export default Route;
