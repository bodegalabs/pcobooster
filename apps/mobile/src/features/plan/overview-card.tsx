import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Glyph } from "../../components/glyph";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import type { AppSymbolName } from "../../design/symbols";

export const OverviewCard = ({
  title,
  symbol,
  summary,
  trailing,
  children,
}: {
  title: string;
  symbol: AppSymbolName;
  summary: string;
  trailing?: ReactNode;
  children: ReactNode;
}) => (
  <SurfaceCard contentStyle={{ gap: 12 }}>
    <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Glyph
            symbol={symbol}
            size={symbol === "people" ? 27 : 22}
            height={symbol === "people" ? 20 : 22}
            color={colors.inkSecondary}
          />
          <AppText
            accessibilityRole="header"
            font="cardTitle"
            numberOfLines={1}
          >
            {title}
          </AppText>
        </View>
        <AppText font="rowDetail" color={colors.inkSecondary} numberOfLines={1}>
          {summary}
        </AppText>
      </View>
      {trailing}
    </View>
    {children}
  </SurfaceCard>
);

export const SegmentLink = ({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Open ${title}`}
    onPress={onPress}
    style={({ pressed }) => [
      {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
      },
      pressed ? { backgroundColor: colors.surfaceHighlight } : null,
    ]}
  >
    <AppText
      font="subheadline"
      weight="medium"
      color={colors.inkSecondary}
      numberOfLines={1}
    >
      {title}
    </AppText>
    <Glyph
      symbol="chevronRight"
      size={10}
      color={colors.inkSecondary}
      weight="semibold"
    />
  </Pressable>
);

export const OverviewRow = ({
  children,
  onPress,
  minHeight = 40,
}: {
  children: ReactNode;
  onPress?: () => void;
  minHeight?: number;
}) => (
  <Pressable
    accessibilityRole={onPress === undefined ? undefined : "button"}
    onPress={onPress}
    style={({ pressed }) => [
      {
        alignItems: "center",
        flexDirection: "row",
        gap: 12,
        minHeight,
        borderRadius: 10,
      },
      pressed ? { backgroundColor: colors.surfaceHighlight } : null,
    ]}
  >
    {children}
  </Pressable>
);
