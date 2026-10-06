import type { PlanStaffing } from "@pcobooster/planning-center-models/plan-overview";
import type { UnnotifiedPerson } from "@pcobooster/planning-center-models/scheduling-notifications";
import { Fragment, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Glyph } from "../../components/glyph";
import { Hairline } from "../../components/hairline";
import { PersonAvatar } from "../../components/person-avatar";
import { PillButton } from "../../components/pill-button";
import { SurfaceColorProvider } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { CssCurves } from "../../design/motion";
import { OverviewCard, OverviewRow, SegmentLink } from "./overview-card";
import { positionSymbol } from "./position-symbol";
import { ReadStatus } from "./read-status";
import { listFormat } from "./roster";

const StaffingBar = ({
  confirmed,
  pending,
  total,
  height = 8,
}: {
  confirmed: number;
  pending: number;
  total: number;
  height?: number;
}) => {
  const reduceMotion = useReducedMotion();
  return (
    <View
      accessibilityElementsHidden
      style={{
        backgroundColor: colors.surfaceMuted,
        borderRadius: 999,
        overflow: "hidden",
        height,
        flexDirection: "row",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "100%",
          transformOrigin: "left center",
          transform: [{ scaleX: (confirmed + pending) / Math.max(total, 1) }],
          transitionProperty: "transform",
          transitionDuration: reduceMotion ? 0 : 400,
          transitionTimingFunction: CssCurves.snappy,
          backgroundColor: colors.statusPendingBright,
        }}
      />
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "100%",
          transformOrigin: "left center",
          transform: [{ scaleX: confirmed / Math.max(total, 1) }],
          transitionProperty: "transform",
          transitionDuration: reduceMotion ? 0 : 400,
          transitionTimingFunction: CssCurves.snappy,
          backgroundColor: colors.statusConfirmedBright,
        }}
      />
    </View>
  );
};

const Legend = ({ staffing }: { staffing: PlanStaffing }) => (
  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
    {[
      {
        count: staffing.confirmed,
        title: "confirmed",
        color: colors.statusConfirmedBright,
      },
      {
        count: staffing.pending,
        title: "pending",
        color: colors.statusPendingBright,
      },
      { count: staffing.open, title: "open", color: colors.surfaceMuted },
    ].map(({ count, title, color }) => (
      <View
        key={title}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <AppText font="footnote" tabular weight="semibold" numberOfLines={1}>
            {count}
          </AppText>
          <AppText
            font="footnote"
            color={colors.inkSecondary}
            numberOfLines={1}
          >
            {title}
          </AppText>
        </View>
      </View>
    ))}
  </View>
);

const Notifications = ({
  people,
  onSend,
}: {
  people: readonly UnnotifiedPerson[];
  onSend?: () => void;
}) => {
  const shown = people.slice(0, 3);
  const names =
    people.length > 3
      ? `${shown.map((person) => person.name).join(", ")}, and ${people.length - 3} more`
      : listFormat(shown.map((person) => person.name));
  return (
    <SurfaceColorProvider value="infoSurface">
      <View
        style={{
          padding: 12,
          gap: 8,
          backgroundColor: colors.infoSurface,
          borderColor: colors.infoBorder,
          borderWidth: 0.33,
          borderRadius: 18,
          borderCurve: "continuous",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flexDirection: "row" }}>
            {shown.map((person, index) => (
              <View
                key={person.key}
                style={{ marginLeft: index === 0 ? 0 : -8 }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: -1.5,
                    right: -1.5,
                    top: -1.5,
                    bottom: -1.5,
                    borderRadius: 999,
                    backgroundColor: colors.infoSurface,
                  }}
                />
                <PersonAvatar
                  name={person.name}
                  photoUrl={person.photoThumbnailUrl}
                  size="small"
                />
              </View>
            ))}
          </View>
          <AppText
            font="rowTitleEmphasized"
            style={{ flex: 1 }}
          >{`${people.length} ${people.length === 1 ? "person" : "people"} not notified`}</AppText>
        </View>
        <AppText font="rowDetail">{names}</AppText>
        <AppText font="rowDetail" color={colors.inkSecondary}>
          They can&apos;t see or answer until the scheduling email is sent in
          Planning Center.
        </AppText>
        {onSend === undefined ? null : (
          <View style={{ alignSelf: "flex-start", paddingTop: 4 }}>
            <PillButton
              title="Send in Planning Center"
              symbol="arrowUpRight"
              kind="outline"
              size="small"
              onPress={onSend}
            />
          </View>
        )}
      </View>
    </SurfaceColorProvider>
  );
};

export const PeopleCard = ({
  staffing,
  unnotified,
  error,
  retry,
  onLineup,
  onAssign,
  onSend,
}: {
  staffing: PlanStaffing | null;
  unnotified: readonly UnnotifiedPerson[];
  error: Error | null;
  retry: () => void;
  onLineup: () => void;
  onAssign: (teamId: string, positionId: string) => void;
  onSend?: () => void;
}) => {
  const [showsAll, setShowsAll] = useState(false);
  return (
    <OverviewCard
      title="People"
      symbol="people"
      summary={
        staffing === null
          ? ""
          : `${staffing.confirmed + staffing.pending} of ${staffing.total} slots filled`
      }
      trailing={<SegmentLink title="Lineup" onPress={onLineup} />}
    >
      {staffing === null ? (
        <ReadStatus error={error} retry={retry} />
      ) : (
        <View style={{ gap: 20 }}>
          {staffing.total > 0 ? (
            <View style={{ gap: 10 }}>
              <StaffingBar {...staffing} />
              <Legend staffing={staffing} />
            </View>
          ) : null}
          {unnotified.length > 0 ? (
            <Notifications people={unnotified} onSend={onSend} />
          ) : null}
          {staffing.openPositions.length > 0 ? (
            <View style={{ gap: 4 }}>
              <AppText
                font="footnote"
                weight="medium"
                color={colors.inkSecondary}
              >
                Needs someone {staffing.openPositions.length}
              </AppText>
              <View>
                {(showsAll
                  ? staffing.openPositions
                  : staffing.openPositions.slice(0, 5)
                ).map((position, index) => (
                  <Fragment key={`${position.teamId}:${position.positionId}`}>
                    {index === 0 ? null : (
                      <Hairline inset={36} color={colors.hairlineSubtle} />
                    )}
                    <OverviewRow
                      onPress={() => {
                        onAssign(position.teamId, position.positionId);
                      }}
                      minHeight={44}
                    >
                      <Glyph
                        symbol={positionSymbol(
                          position.positionName,
                          position.teamName
                        )}
                        size={20}
                        width={24}
                        color={colors.inkSecondary}
                      />
                      <AppText
                        font="rowTitle"
                        style={{
                          flex: 1,
                          fontStyle:
                            position.source === "custom" ||
                            position.source === "plan_member"
                              ? "italic"
                              : "normal",
                        }}
                        numberOfLines={2}
                      >
                        {position.positionName}
                        <AppText
                          font="rowTitle"
                          color={colors.inkSecondary}
                        >{` · ${position.teamName}`}</AppText>
                      </AppText>
                      {position.openCount > 1 ? (
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 999,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: colors.hairline,
                          }}
                        >
                          <AppText
                            font="badgeLabel"
                            color={colors.statusDeclinedText}
                          >{`${position.openCount} open`}</AppText>
                        </View>
                      ) : null}
                      <Glyph
                        symbol="chevronRight"
                        size={13}
                        color={colors.inkTertiary}
                      />
                    </OverviewRow>
                  </Fragment>
                ))}
              </View>
              {staffing.openPositions.length > 5 ? (
                <Pressable
                  accessibilityRole="button"
                  style={{
                    minHeight: 32,
                    marginLeft: 36,
                    justifyContent: "center",
                  }}
                  onPress={() => {
                    setShowsAll(!showsAll);
                  }}
                >
                  <AppText font="subheadline" color={colors.inkSecondary}>
                    {showsAll
                      ? "Show fewer"
                      : `Show ${staffing.openPositions.length - 5} more`}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View style={{ gap: 4 }}>
            {staffing.teams.length === 0 ? null : (
              <AppText
                font="footnote"
                weight="medium"
                color={colors.inkSecondary}
              >
                Teams
              </AppText>
            )}
            {staffing.teams.length === 0 ? (
              <AppText font="rowDetail" color={colors.inkSecondary}>
                No positions are requested for this plan yet.
              </AppText>
            ) : (
              <View>
                {staffing.teams.map((team) => (
                  <OverviewRow
                    key={team.teamId}
                    minHeight={36}
                    onPress={onLineup}
                  >
                    <AppText
                      font="rowTitle"
                      numberOfLines={1}
                      style={{ flex: 1 }}
                    >
                      {team.teamName}
                    </AppText>
                    <AppText
                      font="footnote"
                      tabular
                      color={colors.inkSecondary}
                    >{`${team.confirmed + team.pending}/${team.confirmed + team.pending + team.open}`}</AppText>
                    <View style={{ width: 72 }}>
                      <StaffingBar
                        {...team}
                        total={team.confirmed + team.pending + team.open}
                        height={6}
                      />
                    </View>
                  </OverviewRow>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </OverviewCard>
  );
};
