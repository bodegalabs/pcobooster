import type { ScheduleDay } from "@pcobooster/planning-center-models/schedule-days";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { BottomActionBar } from "../../components/bottom-action-bar";
import { AppText } from "../../design/app-text";
import { colors, tokenColor } from "../../design/colors";
import { dayEntries, dayLabel, nearestBusyDay } from "./presentation";

const styles = StyleSheet.create({
  bars: { flexDirection: "row", alignItems: "flex-end", height: 32 },
  column: {
    flex: 1,
    height: 32,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  dates: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    height: 14,
  },
  sheet: { flex: 1, backgroundColor: colors.surfaceCanvas },
});
const barFill = (day: ScheduleDay) => {
  if (day.kind === "service") {
    return day.status === "confirmed"
      ? colors.statusConfirmed
      : colors.statusPending;
  }
  return day.kind === "rehearsal"
    ? tokenColor("inkSecondary", 0.75)
    : colors.surfaceMuted;
};

export const DayBars = ({
  days,
  large = false,
}: {
  days: readonly ScheduleDay[];
  large?: boolean;
}) => {
  const [inspected, setInspected] = useState<ScheduleDay | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(1);
  const barArea = large ? 44 : 32;
  const serviceHeight = large ? 34 : 24;
  const quietHeight = large ? 20 : 14;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Schedule around this plan"
        accessibilityHint="Tap near a busy day to see their schedule"
        onLayout={(event) => {
          setLayoutWidth(event.nativeEvent.layout.width);
        }}
        onPress={(event) => {
          const index = Math.floor(
            (event.nativeEvent.locationX / layoutWidth) * days.length
          );
          setInspected(nearestBusyDay(days, index) ?? null);
        }}
      >
        <View style={[styles.bars, { height: barArea }]}>
          {days.map((day) => (
            <View key={day.dayKey} style={[styles.column, { height: barArea }]}>
              {day.offset === 0 ? (
                <View
                  style={{
                    position: "absolute",
                    width: large ? 13 : 12,
                    height: barArea,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: tokenColor("statusInfo", 0.8),
                  }}
                />
              ) : null}
              {day.offset !== 0 || day.kind !== "free" ? (
                <View
                  style={{
                    width: large ? 5 : 4,
                    height:
                      day.kind === "service" ? serviceHeight : quietHeight,
                    borderRadius: 3,
                    marginBottom: day.offset === 0 ? 3 : 0,
                    backgroundColor: barFill(day),
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.dates}>
          {days.map((day, index) =>
            day.offset % (large ? 7 : 14) === 0 ? (
              <AppText
                key={day.dayKey}
                style={{
                  position: "absolute",
                  width: 48,
                  textAlign: "center",
                  left:
                    Math.min(
                      Math.max(((index + 0.5) / days.length) * layoutWidth, 18),
                      layoutWidth - 18
                    ) - 24,
                }}
                font="caption2"
                numberOfLines={1}
                tabular
                weight={day.offset === 0 ? "semibold" : "regular"}
                color={
                  day.offset === 0 ? colors.statusInfoText : colors.inkTertiary
                }
              >
                {dayLabel(day)}
              </AppText>
            ) : null
          )}
        </View>
      </Pressable>
      <Modal
        visible={inspected !== null}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => {
          setInspected(null);
        }}
      >
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <AppText font="pageTitle">
              {inspected === null ? "" : dayLabel(inspected)}
            </AppText>
            {inspected === null
              ? null
              : dayEntries(inspected).map((item) => (
                  <View
                    key={`${item.planId}:${item.teamPositionName}:${item.timeType}`}
                    style={{ gap: 4 }}
                  >
                    <AppText font="rowTitleEmphasized">
                      {[item.teamName, item.teamPositionName]
                        .filter(Boolean)
                        .join(" - ")}
                    </AppText>
                    <AppText font="meta" color={colors.inkSecondary}>
                      {item.serviceTypeName} ·{" "}
                      {item.timeType === "rehearsal" ? "Rehearsal" : "Service"}{" "}
                      · {item.status === "C" ? "Confirmed" : "Pending"}
                    </AppText>
                  </View>
                ))}
          </ScrollView>
          <BottomActionBar
            actions={[
              {
                title: "Close",
                role: "secondary",
                onPress: () => {
                  setInspected(null);
                },
                testID: "assign-day-close",
              },
            ]}
          />
        </View>
      </Modal>
    </>
  );
};
