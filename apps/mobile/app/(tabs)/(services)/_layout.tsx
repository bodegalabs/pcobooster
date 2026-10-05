import { Stack, router } from "expo-router";

import { Action } from "../../../src/components/ui";

const RootLink = () => (
  <Action
    label="Services"
    onPress={() => {
      router.replace("/(tabs)/(services)/services");
    }}
  />
);

export const unstable_settings = { initialRouteName: "services" };

const TabStack = () => (
  <Stack
    screenOptions={({ navigation }) => ({
      headerBackTitle: "Back",
      headerLeft: navigation.getState().index > 0 ? undefined : RootLink,
    })}
  >
    <Stack.Screen
      name="services"
      options={{ headerShown: false, title: "Services" }}
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
