import {
  Button,
  ContextMenu,
  HStack,
  Image,
  RNHostView,
  Section,
  SwipeActions,
  VStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier,
  background,
  foregroundStyle,
  frame,
  listRowBackground,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { formatTimeOfDay } from "@pcobooster/planning-center-models/plan-overview";
import type {
  PlanTime,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { Pressable, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { Glyph } from "../../../components/glyph";
import { PersonAvatar } from "../../../components/person-avatar";
import { AppText } from "../../../design/app-text";
import {
  colors,
  resolvedTokenColor,
  useColorVariant,
} from "../../../design/colors";
import { NativeLabel } from "../native-label";
import { isPlaceholderId } from "../placeholder-ids";
import {
  endClock,
  peopleAtTime,
  previewNames,
  rowAssignments,
  timeKindLine,
  timeRangeLabel,
  timeTitle,
} from "./logic";
import { timeTint } from "./time-colors";

export const TimeRowContent = ({
  time,
  groups,
  zone,
  onOpen,
}: {
  time: PlanTime;
  groups: TeamPositionGroup[];
  zone: string;
  onOpen: () => void;
}) => {
  const people = peopleAtTime(time.id, groups);
  const summary = rowAssignments(time, groups);
  const end = endClock(time, zone);
  return (
    <Pressable
      testID={`time-row-${time.id}`}
      accessibilityRole="button"
      onPress={onOpen}
      disabled={isPlaceholderId(time.id)}
      style={{
        flexDirection: "row",
        gap: 12,
        paddingVertical: 4,
        opacity: isPlaceholderId(time.id) ? 0.55 : 1,
      }}
    >
      <View style={{ width: 74, alignItems: "flex-end" }}>
        <AppText font="rowTitle" tabular>
          {formatTimeOfDay(time.startsAt, zone)}
        </AppText>
        {end === null ? null : (
          <AppText font="rowDetail" tabular color={colors.inkSecondary}>
            {end}
          </AppText>
        )}
      </View>
      <View
        style={{ width: 3, borderRadius: 999, backgroundColor: timeTint(time) }}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ gap: 2 }}>
          <AppText font="rowTitleEmphasized">{timeTitle(time)}</AppText>
          <AppText font="rowDetail" color={colors.inkSecondary}>
            {timeKindLine(time)}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {summary === null ? null : (
            <Glyph symbol="people" size={13} color={colors.inkTertiary} />
          )}
          <AppText
            font="meta"
            color={summary === null ? colors.inkTertiary : colors.inkSecondary}
          >
            {summary ?? "No teams assigned"}
          </AppText>
          {people.length === 0 ? null : (
            <View style={{ flexDirection: "row" }}>
              {people.slice(0, 3).map((person, index) => (
                <View
                  key={person.planPersonId}
                  style={{ marginLeft: index === 0 ? 0 : -7 }}
                >
                  <PersonAvatar
                    name={person.name}
                    photoUrl={person.photoThumbnailUrl}
                    size="small"
                  />
                </View>
              ))}
              {people.length <= 3 ? null : (
                <View
                  style={{
                    marginLeft: -7,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: colors.surfaceMuted,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AppText font="caption2" color={colors.inkSecondary}>
                    +{people.length - 3}
                  </AppText>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const destructive = { role: "destructive" } as const;
const kindSymbols = {
  service: "calendar",
  rehearsal: "music.mic",
  other: "clock",
} as const satisfies Record<PlanTime["timeType"], SFSymbol>;

/** The long-press preview: name, type and range in the org zone, who it's for, who serves. */
const TimePreview = ({
  time,
  groups,
  zone,
}: {
  time: PlanTime;
  groups: TeamPositionGroup[];
  zone: string;
}) => {
  const variant = useColorVariant();
  const people = peopleAtTime(time.id, groups);
  return (
    <VStack
      alignment="leading"
      spacing={12}
      modifiers={[
        padding({ all: 16 }),
        frame({ width: 320, alignment: "leading" }),
        background(resolvedTokenColor("surfaceCard", variant)),
      ]}
    >
      <HStack spacing={12}>
        <Image
          systemName={kindSymbols[time.timeType]}
          modifiers={[
            frame({ width: 36, height: 36 }),
            foregroundStyle(resolvedTokenColor("ink", variant)),
          ]}
        />
        <VStack alignment="leading" spacing={2}>
          <NativeLabel font="cardTitle">{timeTitle(time)}</NativeLabel>
          <NativeLabel font="rowDetail" color="inkSecondary">
            {timeKindLine(time)}
          </NativeLabel>
        </VStack>
      </HStack>
      <NativeLabel font="rowDetail" tabular>
        {timeRangeLabel(time, zone)}
      </NativeLabel>
      <NativeLabel font="rowDetail" color="inkSecondary">
        {rowAssignments(time, groups) ?? "No teams assigned"}
      </NativeLabel>
      {people.length === 0 ? null : (
        <NativeLabel font="meta" color="inkSecondary">
          {previewNames(people.map((person) => person.name))}
        </NativeLabel>
      )}
    </VStack>
  );
};

export const TimeRow = ({
  time,
  groups,
  zone,
  canChange,
  canAdd,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  time: PlanTime;
  groups: TeamPositionGroup[];
  zone: string;
  canChange: boolean;
  canAdd: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) => {
  const variant = useColorVariant();
  return (
    <SwipeActions
      modifiers={[
        listRowBackground(resolvedTokenColor("surfaceCard", variant)),
        accessibilityIdentifier(`times-row-${time.id}`),
      ]}
    >
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <TimeRowContent
              time={time}
              groups={groups}
              zone={zone}
              onOpen={onOpen}
            />
          </RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Preview>
          <TimePreview time={time} groups={groups} zone={zone} />
        </ContextMenu.Preview>
        <ContextMenu.Items>
          {isPlaceholderId(time.id) ? null : (
            <>
              <Button
                label={canChange ? "Edit time" : "View time"}
                systemImage={canChange ? "square.and.pencil" : "eye"}
                onPress={onOpen}
              />
              {canAdd ? (
                <Button
                  label="Duplicate"
                  systemImage="doc.on.doc"
                  onPress={onDuplicate}
                />
              ) : null}
              {canChange ? (
                <Section>
                  <Button
                    {...destructive}
                    label="Delete time"
                    systemImage="trash"
                    onPress={onDelete}
                  />
                </Section>
              ) : null}
            </>
          )}
        </ContextMenu.Items>
      </ContextMenu>
      {canChange ? (
        <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
          <Button {...destructive} onPress={onDelete}>
            <NativeLabel>Delete</NativeLabel>
          </Button>
        </SwipeActions.Actions>
      ) : null}
    </SwipeActions>
  );
};
