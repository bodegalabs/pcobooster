import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import {
  formatDuration,
  formatTimeOfDay,
} from "@pcobooster/planning-center-models/plan-overview";
import type {
  PlanOrder,
  PlanSchedule,
} from "@pcobooster/planning-center-models/plan-overview";
import { Fragment } from "react";
import { StyleSheet, View } from "react-native";

import { Hairline } from "../../components/hairline";
import { KeyBadge } from "../../components/key-badge";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { useOrgTimeZone } from "../../lib/environment";
import { OverviewCard, OverviewRow, SegmentLink } from "./overview-card";
import { overviewSongKeys, overviewTimeTitle } from "./presentation";
import { ReadStatus } from "./read-status";

interface CardRead {
  readonly error: Error | null;
  readonly retry: () => void;
  readonly onOpen: () => void;
}
interface SongsProps extends CardRead {
  readonly order: PlanOrder | null;
}
interface TimesProps extends CardRead {
  readonly schedule: PlanSchedule | null;
}

const SongKey = ({ label }: { label: string | null }) => {
  const keys = overviewSongKeys(label);
  return keys === null ? <KeyBadge songKey={label} /> : <KeyBadge {...keys} />;
};

const SongsRows = ({ order, error, retry, onOpen }: SongsProps) => {
  if (order === null) {
    return <ReadStatus error={error} retry={retry} />;
  }
  if (order.songs.length === 0) {
    return (
      <AppText font="rowDetail" color={colors.inkSecondary}>
        No songs in the order of service yet.
      </AppText>
    );
  }
  return order.songs.map((song, index) => (
    <Fragment key={song.id}>
      {index === 0 ? null : (
        <Hairline color={colors.hairlineSubtle} inset={28} />
      )}
      <OverviewRow onPress={onOpen}>
        <AppText
          font="footnote"
          tabular
          color={colors.inkTertiary}
          style={{ minWidth: 16, textAlign: "right" }}
        >
          {index + 1}
        </AppText>
        <AppText font="rowTitle" numberOfLines={2} style={{ flex: 1 }}>
          {song.title}
        </AppText>
        {song.length === null || song.length <= 0 ? null : (
          <AppText font="footnote" tabular color={colors.inkTertiary}>
            {formatDuration(song.length)}
          </AppText>
        )}
        <SongKey label={song.keyLabel} />
      </OverviewRow>
    </Fragment>
  ));
};

export const SongsCard = (props: SongsProps) => {
  const { order } = props;
  const summary =
    order === null
      ? ""
      : `${order.songs.length} ${order.songs.length === 1 ? "song" : "songs"}${order.serviceLength > 0 ? ` · ${formatDuration(order.serviceLength)} service` : ""}`;
  return (
    <OverviewCard
      title="Songs"
      symbol="songs"
      summary={summary}
      trailing={<SegmentLink title="Plan" onPress={props.onOpen} />}
    >
      <View>
        <SongsRows {...props} />
      </View>
    </OverviewCard>
  );
};

const TimesRows = ({ schedule, error, retry, onOpen }: TimesProps) => {
  const zone = useOrgTimeZone();
  if (schedule === null) {
    return <ReadStatus error={error} retry={retry} />;
  }
  if (schedule.times.length === 0) {
    return (
      <AppText font="rowDetail" color={colors.inkSecondary}>
        No times on this plan yet.
      </AppText>
    );
  }
  return schedule.times.map((time, index) => (
    <Fragment key={time.id}>
      {index === 0 ? null : <Hairline color={colors.hairlineSubtle} />}
      <OverviewRow onPress={onOpen}>
        <AppText font="rowTitle" tabular numberOfLines={1} style={{ flex: 1 }}>
          {formatCalendarDateLabel(time.startsAt, zone, "weekdayMonthDay")}
          <AppText
            font="rowTitle"
            color={colors.inkSecondary}
          >{` · ${formatTimeOfDay(time.startsAt, zone)}`}</AppText>
        </AppText>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor:
              time.timeType === "service"
                ? colors.surfaceSecondary
                : "transparent",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor:
              time.timeType === "service" ? "transparent" : colors.hairline,
          }}
        >
          <AppText font="badgeLabel" numberOfLines={1}>
            {overviewTimeTitle(time.name, time.timeType)}
          </AppText>
        </View>
      </OverviewRow>
    </Fragment>
  ));
};

export const TimesCard = (props: TimesProps) => (
  <OverviewCard
    title="Times"
    symbol="times"
    summary={
      props.schedule === null
        ? ""
        : `${props.schedule.times.length} ${props.schedule.times.length === 1 ? "time" : "times"}`
    }
    trailing={<SegmentLink title="Times" onPress={props.onOpen} />}
  >
    <View>
      <TimesRows {...props} />
    </View>
  </OverviewCard>
);
