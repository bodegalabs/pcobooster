import type { NativeStackNavigationOptions } from "expo-router";
import { Stack } from "expo-router";
import { PlatformColor, Pressable, StyleSheet, View } from "react-native";

import { Glyph } from "../../components/glyph";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import type { PlanSegment } from "./reads";

const secondary = PlatformColor("secondaryLabel");
const styles = StyleSheet.create({
  title: { justifyContent: "center", maxWidth: 240 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  chevron: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PlatformColor("secondarySystemFill"),
    borderRadius: 8.5,
    height: 17,
    width: 17,
  },
});
const PlanTitle = ({
  title,
  subtitle,
  onMenu,
}: {
  title: string;
  subtitle: string;
  onMenu: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${title}, ${subtitle}`}
    onPress={onMenu}
    style={styles.title}
  >
    <View style={styles.titleRow}>
      <AppText font="subheadline" weight="semibold" numberOfLines={1}>
        {title}
      </AppText>
      <View style={styles.chevron}>
        <Glyph symbol="chevronDown" size={9} color={secondary} weight="bold" />
      </View>
    </View>
    <AppText
      font="caption"
      color={secondary}
      numberOfLines={1}
      style={{ marginTop: -1 }}
    >
      {subtitle}
    </AppText>
  </Pressable>
);

const toolbarOptions = ({
  header,
  segment,
  onTitleMenu,
  onStep,
  onCollapse,
  onExpand,
  onOpenPlanningCenter,
}: {
  header: { title: string; subtitle: string };
  segment: PlanSegment;
  onTitleMenu: () => void;
  onStep: (direction: "previous" | "next") => void;
  onCollapse: () => void;
  onExpand: () => void;
  onOpenPlanningCenter?: () => void;
}): NativeStackNavigationOptions => ({
  title: "",
  headerStyle: { backgroundColor: colors.surfaceCanvas },
  headerBackVisible: true,
  unstable_headerLeftItems: () => [
    {
      type: "custom",
      hidesSharedBackground: true,
      element: <PlanTitle {...header} onMenu={onTitleMenu} />,
    },
  ],
  unstable_headerRightItems: () =>
    segment === "Lineup"
      ? [
          {
            type: "button",
            label: "Previous plan",
            icon: { type: "sfSymbol", name: "chevron.up" },
            onPress: () => {
              onStep("previous");
            },
            sharesBackground: false,
            width: 37,
          },
          {
            type: "menu",
            label: "More",
            icon: { type: "sfSymbol", name: "ellipsis" },
            sharesBackground: false,
            width: 37,
            menu: {
              items: [
                {
                  type: "action",
                  label: "Next plan",
                  icon: { type: "sfSymbol", name: "chevron.down" },
                  onPress: () => {
                    onStep("next");
                  },
                },
                {
                  type: "action",
                  label: "Collapse All Teams",
                  onPress: onCollapse,
                },
                {
                  type: "action",
                  label: "Expand All Teams",
                  onPress: onExpand,
                },
                ...(onOpenPlanningCenter === undefined
                  ? []
                  : [
                      {
                        type: "action" as const,
                        label: "Open in Planning Center",
                        onPress: onOpenPlanningCenter,
                      },
                    ]),
              ],
            },
          },
        ]
      : [
          {
            type: "button",
            label: "Previous plan",
            icon: { type: "sfSymbol", name: "chevron.up" },
            onPress: () => {
              onStep("previous");
            },
            sharesBackground: true,
            width: 37,
          },
          {
            type: "button",
            label: "Next plan",
            icon: { type: "sfSymbol", name: "chevron.down" },
            onPress: () => {
              onStep("next");
            },
            sharesBackground: true,
            width: 37,
          },
        ],
});

export const PlanToolbar = (props: Parameters<typeof toolbarOptions>[0]) => (
  <Stack.Screen options={toolbarOptions(props)} />
);
