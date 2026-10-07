import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { Fragment } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { DashedCircle } from "../../components/dashed-circle";
import { Glyph } from "../../components/glyph";
import { Hairline } from "../../components/hairline";
import { PersonAvatar } from "../../components/person-avatar";
import { StatusDot } from "../../components/status-dot";
import { SurfaceColorProvider } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors, tokenColor } from "../../design/colors";
import { Metrics, Spacing } from "../../design/metrics";
import type { StatusTone } from "../../design/status";
import { scheduleStatusLabel } from "../../design/status";
import { positionSymbol } from "./position-symbol";
import {
  canAddSlot,
  canRemoveSlot,
  filled,
  isTemporary,
  listFormat,
  openSlots,
  personStatus,
  staffing,
} from "./roster";

type Adjust = (position: TeamPosition, change: "add" | "remove") => void;
const SYMBOL_WIDTH = 22;
const PERSON_INSET = SYMBOL_WIDTH + Spacing.md - 2;
const LIST_MARGIN = 16;
const SECTION_RADIUS = 26;
const LIST_SEPARATOR = tokenColor("hairline", 0.48);
const styles = StyleSheet.create({
  list: {
    gap: Spacing.md,
    paddingHorizontal: LIST_MARGIN,
    paddingTop: Spacing.xs,
  },
  notify: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 15,
  },
  notifyIcon: {
    alignItems: "center",
    backgroundColor: tokenColor("statusPending", 0.13),
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  openCircle: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  personRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: Spacing.md,
    paddingLeft: PERSON_INSET,
  },
  pill: {
    alignItems: "center",
    borderColor: colors.hairline,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    minHeight: 28,
    paddingHorizontal: Spacing.md,
  },
  rowPress: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md - 2,
    paddingHorizontal: Spacing.lg,
  },
  section: {
    backgroundColor: colors.surfaceCard,
    borderCurve: "continuous",
    borderRadius: SECTION_RADIUS,
    overflow: "hidden",
  },
  segmentBar: { paddingBottom: Spacing.sm, paddingHorizontal: Spacing.lg },
  // A List row at least 36 pt tall (`defaultMinListRowHeight`), content centered.
  staffing: {
    alignContent: "center",
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
    minHeight: 36,
    paddingHorizontal: Spacing.xs,
  },
  staffingItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.xs + 2,
  },
  stepButton: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 30,
  },
  stepCount: { minWidth: 34, textAlign: "center" },
  stepper: {
    alignItems: "center",
    backgroundColor: colors.surfaceCard,
    borderColor: colors.hairline,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    padding: 2,
  },
  symbolColumn: { alignItems: "center", width: SYMBOL_WIDTH },
});

// MARK: Summary

const StaffingItem = ({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: StatusTone;
}) => (
  <View style={styles.staffingItem}>
    <StatusDot tone={tone} size={8} />
    <AppText font="footnote" weight="semibold" tabular numberOfLines={1}>
      {count}
    </AppText>
    <AppText font="footnote" color={colors.inkSecondary} numberOfLines={1}>
      {label}
    </AppText>
  </View>
);

export const StaffingStrip = ({
  groups,
}: {
  groups: readonly TeamPositionGroup[];
}) => {
  const counts = staffing(groups);
  return (
    <View style={styles.staffing} accessible>
      <StaffingItem
        count={counts.confirmed}
        label="Confirmed"
        tone="confirmed"
      />
      <StaffingItem count={counts.pending} label="Pending" tone="pending" />
      {counts.declined > 0 ? (
        <StaffingItem
          count={counts.declined}
          label="Declined"
          tone="declined"
        />
      ) : null}
      <View style={styles.staffingItem}>
        <DashedCircle
          size={9}
          lineWidth={1.2}
          dash={2}
          gap={1.5}
          color={counts.open > 0 ? colors.statusDeclined : colors.inkTertiary}
        />
        <AppText
          font="footnote"
          weight="semibold"
          tabular
          color={
            counts.open > 0 ? colors.statusDeclinedText : colors.inkSecondary
          }
          numberOfLines={1}
        >
          {counts.open}
        </AppText>
        <AppText font="footnote" color={colors.inkSecondary} numberOfLines={1}>
          Open
        </AppText>
      </View>
    </View>
  );
};

export const NotifyBanner = ({
  names,
  onSend,
}: {
  names: string[];
  onSend?: () => void;
}) => (
  <View style={styles.notify}>
    <View style={styles.notifyIcon}>
      <Glyph
        symbol="mail"
        size={23}
        height={20}
        color={colors.statusPendingText}
      />
    </View>
    <View style={{ flex: 1, gap: Spacing.xxs }}>
      <AppText font="rowTitleEmphasized">
        {names.length === 1
          ? "1 person hasn't been notified"
          : `${names.length} people haven't been notified`}
      </AppText>
      <AppText font="meta" color={colors.inkSecondary} numberOfLines={2}>
        {listFormat(names)}
      </AppText>
    </View>
    {onSend === undefined ? null : (
      <Pressable
        accessibilityRole="button"
        onPress={onSend}
        accessibilityLabel="Send scheduling emails in Planning Center"
        style={({ pressed }) => [
          styles.pill,
          pressed ? { backgroundColor: colors.surfaceHighlight } : null,
        ]}
      >
        <Glyph symbol="openExternal" size={13} color={colors.ink} />
        <AppText font="subheadline" weight="medium" numberOfLines={1}>
          Send
        </AppText>
      </Pressable>
    )}
  </View>
);

// MARK: Rows

const Stepper = ({
  position,
  onAdjust,
  canSchedule,
}: {
  position: TeamPosition;
  onAdjust: Adjust;
  canSchedule: boolean;
}) => {
  const add = canSchedule && canAddSlot(position);
  const remove = canSchedule && canRemoveSlot(position);
  const total = filled(position) + openSlots(position);
  return (
    <View
      style={styles.stepper}
      accessibilityLabel={`Open slots for ${position.name}`}
    >
      <Pressable
        onPress={() => {
          onAdjust(position, "remove");
        }}
        accessibilityRole="button"
        accessibilityLabel={`Remove open slot for ${position.name}`}
        disabled={!remove}
        style={[styles.stepButton, { opacity: remove ? 1 : 0.3 }]}
      >
        <Glyph
          symbol="subtract"
          size={13}
          color={colors.ink}
          weight="semibold"
        />
      </Pressable>
      <AppText
        font="footnote"
        weight="semibold"
        tabular
        style={styles.stepCount}
        numberOfLines={1}
      >
        {`${filled(position)}/${total}`}
      </AppText>
      <Pressable
        onPress={() => {
          onAdjust(position, "add");
        }}
        accessibilityRole="button"
        accessibilityLabel={`Add open slot for ${position.name}`}
        disabled={!add}
        style={[styles.stepButton, { opacity: add ? 1 : 0.3 }]}
      >
        <Glyph symbol="add" size={13} color={colors.ink} weight="semibold" />
      </Pressable>
    </View>
  );
};

const RowPressable = ({
  children,
  minHeight,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  minHeight: number;
  accessibilityLabel?: string;
  onPress?: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    style={({ pressed }) => [
      styles.rowPress,
      { minHeight },
      pressed ? { backgroundColor: colors.surfaceHighlight } : null,
    ]}
  >
    {children}
  </Pressable>
);

const TeamHeader = ({
  group,
  collapsed,
  onToggle,
}: {
  group: TeamPositionGroup;
  collapsed: boolean;
  onToggle: () => void;
}) => (
  <RowPressable onPress={onToggle} minHeight={Metrics.minimumTapTarget}>
    <View style={styles.symbolColumn}>
      <Glyph
        symbol={positionSymbol(group.teamName, group.teamName)}
        size={18}
        pointSize={17}
        color={colors.inkSecondary}
      />
    </View>
    <AppText font="headline" numberOfLines={1} style={{ flex: 1 }}>
      {group.teamName}
    </AppText>
    <Glyph
      symbol={collapsed ? "chevronRight" : "chevronDown"}
      size={13}
      width={13}
      height={8}
      color={colors.inkTertiary}
      weight="semibold"
    />
  </RowPressable>
);

const PositionRow = ({
  group,
  position,
  onAdjust,
  onOpen,
  canSchedule,
}: {
  group: TeamPositionGroup;
  position: TeamPosition;
  onAdjust: Adjust;
  onOpen: () => void;
  canSchedule: boolean;
}) => (
  <RowPressable onPress={onOpen} minHeight={40}>
    <View style={styles.symbolColumn}>
      <Glyph
        symbol={positionSymbol(position.name, group.teamName)}
        size={20}
        pointSize={15}
        color={colors.inkSecondary}
      />
    </View>
    <AppText
      font="rowTitleEmphasized"
      numberOfLines={2}
      style={[
        { flex: 1 },
        isTemporary(position) ? { fontStyle: "italic" } : null,
      ]}
    >
      {position.name}
    </AppText>
    <Stepper
      position={position}
      onAdjust={onAdjust}
      canSchedule={canSchedule}
    />
  </RowPressable>
);

const PersonRow = ({
  person,
  onPress,
}: {
  person: FilledPositionPerson;
  onPress: () => void;
}) => {
  const status = personStatus(person);
  const declined = status === "declined";
  return (
    <RowPressable
      onPress={onPress}
      minHeight={Metrics.minimumTapTarget}
      accessibilityLabel={`${person.name}, Status: ${scheduleStatusLabel[status]}`}
    >
      <View style={styles.personRow}>
        <PersonAvatar
          name={person.name}
          photoUrl={person.photoThumbnailUrl}
          status={status}
        />
        <AppText
          font="rowTitle"
          color={declined ? colors.inkSecondary : colors.ink}
          numberOfLines={1}
          style={[
            { flex: 1 },
            declined ? { textDecorationLine: "line-through" } : null,
          ]}
        >
          {person.name}
        </AppText>
      </View>
    </RowPressable>
  );
};

const openLabel = (open: number): string => {
  if (open === 0) {
    return "No one yet";
  }
  return open === 1 ? "Open" : `${open} open`;
};

const OpenRow = ({ open, onPress }: { open: number; onPress: () => void }) => (
  <RowPressable onPress={onPress} minHeight={Metrics.minimumTapTarget}>
    <View style={styles.personRow}>
      <View style={styles.openCircle}>
        <View style={StyleSheet.absoluteFill}>
          <DashedCircle
            size={32}
            lineWidth={1}
            dash={3}
            gap={2.5}
            color={
              open > 0 ? tokenColor("statusDeclined", 0.55) : colors.inkTertiary
            }
          />
        </View>
        <Glyph
          symbol="addPerson"
          size={14}
          color={open > 0 ? colors.statusDeclinedText : colors.inkSecondary}
        />
      </View>
      <AppText
        font="rowDetail"
        weight={open > 0 ? "medium" : undefined}
        color={open > 0 ? colors.statusDeclinedText : colors.inkSecondary}
        tabular
        numberOfLines={1}
      >
        {openLabel(open)}
      </AppText>
    </View>
  </RowPressable>
);

export const TeamSection = ({
  group,
  collapsed,
  onToggle,
  onAdjust,
  onPerson,
  onOpen,
  canSchedule,
}: {
  group: TeamPositionGroup;
  collapsed: boolean;
  onToggle: () => void;
  onAdjust: Adjust;
  onPerson: (person: FilledPositionPerson, position: TeamPosition) => void;
  onOpen: (position: TeamPosition) => void;
  canSchedule: boolean;
}) => (
  <SurfaceColorProvider value="surfaceCard">
    <View style={styles.section}>
      <TeamHeader group={group} collapsed={collapsed} onToggle={onToggle} />
      {collapsed
        ? null
        : group.positions.map((position) => {
            const open = openSlots(position);
            const people = position.filledPeople ?? [];
            return (
              <Fragment key={position.id}>
                <Hairline
                  inset={Spacing.lg + PERSON_INSET}
                  trailing={Spacing.lg}
                  thickness={1}
                  color={LIST_SEPARATOR}
                  overlap
                />
                <PositionRow
                  group={group}
                  position={position}
                  onAdjust={onAdjust}
                  onOpen={() => {
                    onOpen(position);
                  }}
                  canSchedule={canSchedule}
                />
                {people.map((person) => (
                  <PersonRow
                    key={person.personId ?? person.id}
                    person={person}
                    onPress={() => {
                      onPerson(person, position);
                    }}
                  />
                ))}
                {open > 0 || people.length === 0 ? (
                  <OpenRow
                    open={open}
                    onPress={() => {
                      onOpen(position);
                    }}
                  />
                ) : null}
              </Fragment>
            );
          })}
    </View>
  </SurfaceColorProvider>
);
