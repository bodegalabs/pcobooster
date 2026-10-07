import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "../components/empty-state";
import { PillButton } from "../components/pill-button";
import { colors } from "../design/colors";
import { deviceDiagnostics } from "./device-diagnostics";

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surfaceCanvas,
    flex: 1,
    justifyContent: "center",
  },
});

/**
 * The root route's error boundary (exported as `ErrorBoundary` from `app/_layout.tsx`). React
 * Native reports a render error no boundary catches as a soft exception and leaves a blank
 * screen, so this both reports it and offers a way back.
 */
export const RenderFailure = ({ error, retry }: ErrorBoundaryProps) => {
  useEffect(() => {
    // API failures are skipped here: the query cache reports them once, with their request ID.
    deviceDiagnostics.captureException(error, "react-error-boundary");
  }, [error]);
  return (
    <View style={styles.root}>
      <EmptyState
        actions={
          <PillButton
            onPress={() => {
              void retry();
            }}
            title="Try Again"
          />
        }
        artwork="warning"
        description="Something went wrong on this screen."
        title="Couldn't Show This"
      />
    </View>
  );
};
