import { Redirect, Tabs, useSegments } from "expo-router";
import { useEffect } from "react";

import { activeCredentials } from "../../src/auth/protocol";
import { useAccount, useSession } from "../../src/runtime";
import { rememberActiveTab } from "../../src/tab-routing";

const ProductTabs = () => {
  const context = useSession();
  const segments = useSegments();
  useEffect(() => {
    rememberActiveTab(segments);
  }, [segments]);
  const account = useAccount();
  const credentials = activeCredentials(context.session);
  if (context.launching) {
    return null;
  }
  if (
    credentials.token === null &&
    credentials.demoToken === null &&
    !(__DEV__ && process.env.EXPO_PUBLIC_LOCAL_AUTH === "1")
  ) {
    return <Redirect href="/" />;
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarLabelStyle: { fontSize: 13 },
        tabBarIcon: () => null,
      }}
    >
      <Tabs.Screen name="(services)" options={{ title: "Services" }} />
      <Tabs.Screen
        name="(people)"
        options={{
          title: "People",
          href: account.features.data?.people === true ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="(songs)"
        options={{
          title: "Songs",
          href: account.features.data?.chordCharts === true ? undefined : null,
        }}
      />
      <Tabs.Screen name="(search)" options={{ title: "Search" }} />
    </Tabs>
  );
};
export default ProductTabs;
