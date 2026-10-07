import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useFeatures } from "../../src/app-shell/features";
import { colors } from "../../src/design/colors";
import { TabSymbol } from "../../src/design/symbols";

/**
 * Services, People (`people` flag), Songs (`chordCharts` flag), and Search as the system tab bar
 * (Liquid Glass), minimizing as content scrolls down. Each tab owns a native stack.
 */
const TabsLayout = () => {
  const features = useFeatures();
  return (
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={colors.inkFill}>
      <NativeTabs.Trigger name="services">
        <NativeTabs.Trigger.Icon sf={TabSymbol.services} />
        <NativeTabs.Trigger.Label>Services</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger hidden={!features.people} name="people">
        <NativeTabs.Trigger.Icon sf={TabSymbol.people} />
        <NativeTabs.Trigger.Label>People</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger hidden={!features.chordCharts} name="songs">
        <NativeTabs.Trigger.Icon sf={TabSymbol.songs} />
        <NativeTabs.Trigger.Label>Songs</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon sf={TabSymbol.search} />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
};

export default TabsLayout;
