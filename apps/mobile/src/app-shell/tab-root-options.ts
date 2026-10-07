import type { NativeStackNavigationOptions } from "expo-router";

import { colors } from "../design/colors";

/** A tab root's title: large, over the canvas, collapsing into the bar as content scrolls. */
export const tabRootOptions = (
  title: string
): NativeStackNavigationOptions => ({
  title,
  headerLargeTitleEnabled: true,
  headerLargeTitleShadowVisible: false,
  headerLargeTitleStyle: { color: colors.ink },
  headerTitleStyle: { color: colors.ink },
  headerTransparent: true,
});
