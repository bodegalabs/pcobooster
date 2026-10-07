import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { LogBox, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppProviders } from "../src/app-shell/app-providers";
import { LaunchRoute } from "../src/app-shell/launch-route";
import { useSession } from "../src/app-shell/session";
import { colors } from "../src/design/colors";
import { launchOptions } from "../src/harness/current-launch-options";

if (launchOptions.mock) {
  // Development warnings would cover the tab bar in fixture screenshots.
  LogBox.ignoreAllLogs();
}

const styles = { root: { flex: 1 } } as const;

/**
 * Signed in: the tabs, the account sheet, and (development) the design system gallery. Signed
 * out: the sign-in screen. Guards swap the two, so a sign-out lands on sign-in.
 */
const RootStack = () => {
  const { isSignedIn } = useSession();
  return (
    <>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.surfaceCanvas },
          headerShown: false,
        }}
      >
        <Stack.Protected guard={isSignedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="lineup-person"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              headerShown: true,
              headerShadowVisible: false,
              headerTintColor: colors.ink,
              contentStyle: { backgroundColor: colors.surfaceCanvas },
            }}
          />
          <Stack.Screen
            name="account"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [1],
              sheetGrabberVisible: true,
              headerShown: true,
              title: "Account",
              headerShadowVisible: false,
              headerTintColor: colors.ink,
              headerTitleStyle: { color: colors.ink },
              contentStyle: { backgroundColor: colors.surfaceCanvas },
            }}
          />
          <Stack.Screen
            name="account-access"
            options={{
              headerShown: true,
              title: "Your Access",
              presentation: "formSheet",
            }}
          />
          <Stack.Screen
            name="account-feedback"
            options={{
              headerShown: true,
              title: "Send Feedback",
              presentation: "formSheet",
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={__DEV__}>
          <Stack.Screen name="gallery" />
          <Stack.Screen
            name="gallery-sheet"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              contentStyle: { backgroundColor: colors.surfaceCanvas },
            }}
          />
        </Stack.Protected>
      </Stack>
      <LaunchRoute isSignedIn={isSignedIn} />
    </>
  );
};

/**
 * The navigation theme follows the system appearance: the native stack sets the header's
 * `overrideUserInterfaceStyle` from `theme.dark`, so without it header items stay light in dark
 * mode.
 */
const RootLayout = () => {
  const isDark = useColorScheme() === "dark";
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <AppProviders>
          <RootStack />
        </AppProviders>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;
