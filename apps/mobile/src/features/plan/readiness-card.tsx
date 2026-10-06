import type { ReadinessCheck } from "@pcobooster/planning-center-models/plan-overview";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import {
  createAnimatedComponent,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Glyph } from "../../components/glyph";
import { AppText } from "../../design/app-text";
import {
  colors,
  resolvedTokenColor,
  useColorVariant,
} from "../../design/colors";
import { snappy } from "../../design/motion";
import { OverviewCard, OverviewRow } from "./overview-card";
import { ReadStatus } from "./read-status";

const AnimatedCircle = createAnimatedComponent(Circle);

const Ring = ({ done, total }: { done: number; total: number }) => {
  const variant = useColorVariant();
  const circumference = 40 * Math.PI;
  const fraction = done / Math.max(total, 1);
  const progress = useSharedValue(fraction);
  useEffect(() => {
    progress.set(withTiming(fraction, snappy(400)));
  }, [fraction, progress]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.get()),
  }));
  return (
    <View
      accessible
      accessibilityLabel={`${done} of ${total} checks done`}
      style={{
        width: 40,
        height: 40,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Svg
        width={44}
        height={44}
        style={[StyleSheet.absoluteFill, { left: -2, top: -2 }]}
      >
        <Circle
          cx={22}
          cy={22}
          r={20}
          stroke={resolvedTokenColor("surfaceMuted", variant)}
          strokeWidth={4}
          fill="none"
        />
        <AnimatedCircle
          cx={22}
          cy={22}
          r={20}
          stroke={resolvedTokenColor(
            done === total ? "statusConfirmed" : "statusPending",
            variant
          )}
          strokeWidth={4}
          fill="none"
          strokeDasharray={[circumference, circumference]}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
      </Svg>
      <AppText
        font="caption2"
        weight="semibold"
        tabular
        color={colors.inkSecondary}
        numberOfLines={1}
      >{`${done}/${total}`}</AppText>
    </View>
  );
};

const readinessSummary = (incomplete: boolean, todo: number): string => {
  if (incomplete) {
    return "Readiness could not be fully checked.";
  }
  if (todo === 0) {
    return "Everything we can check looks ready.";
  }
  return `${todo} ${todo === 1 ? "thing" : "things"} left to do.`;
};

export const ReadinessCard = ({
  checks,
  loading,
  incomplete,
  opensPlanningCenter,
  onSelect,
}: {
  checks: readonly ReadinessCheck[];
  loading: boolean;
  incomplete: boolean;
  opensPlanningCenter: boolean;
  onSelect: (check: ReadinessCheck) => void;
}) => {
  const done = checks.filter((check) => check.state === "done").length;
  const todo = checks.length - done;
  const summary = readinessSummary(incomplete, todo);
  return (
    <OverviewCard
      title="Readiness"
      symbol="readinessSeal"
      summary={loading && checks.length === 0 ? "Checking readiness" : summary}
      trailing={
        checks.length === 0 ? null : <Ring done={done} total={checks.length} />
      }
    >
      <View style={{ gap: 4 }}>
        {checks.map((check) => (
          <OverviewRow
            key={check.id}
            onPress={() => {
              onSelect(check);
            }}
          >
            <Glyph
              symbol={check.state === "done" ? "success" : "errorFill"}
              size={19}
              color={
                check.state === "done"
                  ? colors.statusConfirmed
                  : colors.statusPending
              }
            />
            <AppText
              font="rowTitle"
              color={check.state === "done" ? colors.inkSecondary : colors.ink}
              style={{ flex: 1 }}
            >
              {check.label}
            </AppText>
            <Glyph
              symbol={
                check.id === "notifications" && opensPlanningCenter
                  ? "arrowUpRight"
                  : "chevronRight"
              }
              size={13}
              color={colors.inkTertiary}
              weight="semibold"
            />
          </OverviewRow>
        ))}
        {loading ? <ReadStatus error={null} /> : null}
      </View>
    </OverviewCard>
  );
};
