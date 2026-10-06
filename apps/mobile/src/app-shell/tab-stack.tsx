import { Stack } from "expo-router";
import type { NativeStackNavigationOptions } from "expo-router";

import { colors } from "../design/colors";
import { tabRootOptions } from "./tab-root-options";

/** Every tab's native stack: canvas content, ink header items, minimal back buttons. */
const stackOptions: NativeStackNavigationOptions = {
  contentStyle: { backgroundColor: colors.surfaceCanvas },
  headerBackButtonDisplayMode: "minimal",
  headerShadowVisible: false,
  headerTintColor: colors.ink,
};

/** One tab's stack, its root titled `title`. */
export const TabStack = ({ title }: { title: string }) => (
  <Stack screenOptions={stackOptions}>
    <Stack.Screen name="index" options={tabRootOptions(title)} />
  </Stack>
);
