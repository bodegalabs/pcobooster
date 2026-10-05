import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { Appearance } from "react-native";

import { PreferencesStore } from "./auth/preferences-store";
import type { NativePreferences } from "./auth/preferences-store";
import { runAction } from "./errors";
import { initializeNativeAnalytics } from "./native-analytics";

const store = new PreferencesStore(AsyncStorage);
const appearanceScheme = {
  System: "unspecified",
  Light: "light",
  Dark: "dark",
} as const;
export const useNativePreferences = () => {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    Appearance.setColorScheme(appearanceScheme[snapshot.appearance]);
  }, [snapshot.appearance]);
  return {
    ...snapshot,
    update: async (preferences: NativePreferences): Promise<void> => {
      await store.update(preferences);
    },
  };
};
export const useRestoreNativePreferences = (): void => {
  useNativePreferences();
  useEffect(() => {
    void runAction(async () => {
      await store.restore();
      await initializeNativeAnalytics(() => store.getSnapshot().analytics);
    });
  }, []);
};
