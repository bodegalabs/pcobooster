import type { PlanTime } from "@pcobooster/planning-center-models/types";
import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";

import { AppText } from "../../../design/app-text";
import { colors } from "../../../design/colors";
import { durationLabel, timeTitle } from "./logic";
import { timeTint } from "./time-colors";
import { dayTimeline } from "./timeline";

const tickAlignment = (fraction: number): "left" | "right" | "center" => {
  if (fraction === 0) {
    return "left";
  }
  return fraction === 1 ? "right" : "center";
};

export const TimelineTrack = ({
  times,
  zone,
  onSelect,
}: {
  times: PlanTime[];
  zone: string;
  onSelect: (time: PlanTime) => void;
}) => {
  const dimensions = useWindowDimensions();
  const [width, setWidth] = useState(dimensions.width - 64);
  const layout = dayTimeline(times, zone);
  const height = layout.laneCount * 22 + (layout.laneCount - 1) * 3 + 6;
  const ticks = layout.ticks.filter(
    (_, index) =>
      index === 0 ||
      index === layout.ticks.length - 1 ||
      width / Math.max(1, layout.ticks.length - 1) >= 48 ||
      index % 2 === 0
  );
  return (
    <View
      testID="times-day-timeline"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      style={{ width: dimensions.width - 64, paddingVertical: 4, gap: 4 }}
    >
      <View
        style={{
          height,
          borderRadius: 6,
          backgroundColor: colors.surfaceMuted,
          overflow: "hidden",
        }}
      >
        {layout.gaps.map((gap) => (
          <View
            key={gap.start}
            style={{
              position: "absolute",
              left: gap.start * width,
              width: (gap.end - gap.start) * width,
              height,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {(gap.end - gap.start) * width < 34 ? null : (
              <AppText font="caption2" color={colors.inkSecondary}>
                {durationLabel(gap.seconds)}
              </AppText>
            )}
          </View>
        ))}
        {layout.blocks.map((block) => (
          <Pressable
            key={block.time.id}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${timeTitle(block.time)}`}
            onPress={() => {
              onSelect(block.time);
            }}
            style={{
              position: "absolute",
              left: block.start * width + 1,
              top: 3 + block.lane * 25,
              width: Math.max(8, (block.end - block.start) * width - 2),
              height: 22,
              borderRadius: 4,
              backgroundColor: timeTint(block.time),
            }}
          />
        ))}
      </View>
      <View style={{ height: 14 }}>
        {ticks.map((tick) => (
          <View
            key={tick.fraction}
            style={{
              position: "absolute",
              left: Math.min(
                Math.max(0, tick.fraction * width - 20),
                Math.max(0, width - 40)
              ),
              width: 40,
            }}
          >
            <AppText
              font="caption2"
              tabular
              color={colors.inkTertiary}
              style={{
                textAlign: tickAlignment(tick.fraction),
              }}
            >
              {tick.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
};
