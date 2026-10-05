import { Stack, router } from "expo-router";

import { Action } from "../../../src/components/ui";

const RootLink = () => (
  <Action
    label="Songs"
    onPress={() => {
      router.replace("/(tabs)/(songs)/songs");
    }}
  />
);

export const unstable_settings = { initialRouteName: "songs" };

const TabStack = () => (
  <Stack
    screenOptions={({ navigation }) => ({
      headerBackTitle: "Back",
      headerLeft: navigation.getState().index > 0 ? undefined : RootLink,
    })}
  >
    <Stack.Screen
      name="songs"
      options={{ headerShown: false, title: "Songs" }}
    />
    <Stack.Screen
      name="services/[serviceTypeId]/plans/[planId]/index"
      options={{ title: "Plan" }}
    />
    <Stack.Screen
      name="services/[serviceTypeId]/plans/[planId]/assign"
      options={{ title: "Assign" }}
    />
    <Stack.Screen name="people/[personId]" options={{ title: "Person" }} />
    <Stack.Screen name="songs/[songId]/index" options={{ title: "Song" }} />
    <Stack.Screen name="songs/[songId]/chart" options={{ title: "Chart" }} />
  </Stack>
);
export default TabStack;
