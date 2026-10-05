import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import {
  Stack,
  useGlobalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";
import { useEffect } from "react";
import { StatusBar, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  clearNativeRoute,
  rememberNativeRoute,
} from "../src/auth/route-intent";
import { useServicesAccess } from "../src/auth/services-access";
import { useRestoreNativePreferences } from "../src/preferences";
import { SessionProvider } from "../src/runtime";
import { tabGroupFromSegments } from "../src/tab-routing";

const ProtectedNavigation = () => {
  const path = usePathname();
  const segments = useSegments();
  const callerGroup = tabGroupFromSegments(segments);
  const params = useGlobalSearchParams();
  const { signedIn, access, canEnterProduct } = useServicesAccess();
  useEffect(() => {
    if (!canEnterProduct) {
      rememberNativeRoute(path, params, callerGroup);
    } else if (canEnterProduct && path !== "/" && path !== "/account") {
      clearNativeRoute();
    }
  }, [path, params, canEnterProduct, callerGroup]);
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="demo/[key]" options={{ title: "Demo" }} />
      <Stack.Protected
        guard={canEnterProduct || (signedIn && access.isPending)}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen
          name="account"
          options={{ presentation: "modal", title: "Account" }}
        />
      </Stack.Protected>
    </Stack>
  );
};

const RootLayout = () => {
  useRestoreNativePreferences();
  const dark = useColorScheme() === "dark";
  return (
    <SafeAreaProvider>
      <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
        <SessionProvider>
          <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
          <ProtectedNavigation />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};
export default RootLayout;
