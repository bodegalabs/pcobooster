import {
  HStack,
  Host,
  List,
  RNHostView,
  Section,
  Spacer,
  VStack,
} from "@expo/ui/swift-ui";
import {
  background,
  listStyle,
  listRowBackground,
  refreshable,
  scrollContentBackground,
} from "@expo/ui/swift-ui/modifiers";
import type { PlanTime } from "@pcobooster/planning-center-models/types";
import { useState } from "react";
import { View } from "react-native";

import { useProductClient } from "../../../app-shell/queries";
import { useVisibleQuery as useQuery } from "../../../app-shell/visible-queries";
import { EmptyState } from "../../../components/empty-state";
import { FloatingGlassBar } from "../../../components/floating-glass-bar";
import { resolvedTokenColor, useColorVariant } from "../../../design/colors";
import { useClock, useOrgTimeZone } from "../../../lib/environment";
import { useContentAccess } from "../content-access";
import { NativeLabel } from "../native-label";
import { isPlaceholderId } from "../placeholder-ids";
import { ReadStatus } from "../read-status";
import { planReads } from "../reads";
import type { PlanIds } from "../reads";
import { usePlanWriter } from "../use-plan-writer";
import { requestTimeDelete } from "./confirm-delete";
import { timeDays } from "./logic";
import { TimeEditor } from "./time-editor";
import { TimeRow } from "./time-row";
import { TimelineTrack } from "./timeline-track";

type EditorRequest =
  | { kind: "edit"; time: PlanTime }
  | { kind: "add"; template: PlanTime[] };
export const PlanTimes = ({ ids }: { ids: PlanIds }) => {
  const context = useProductClient();
  const zone = useOrgTimeZone();
  const clock = useClock();
  const variant = useColorVariant();
  const times = useQuery(planReads.times(context, ids));
  const groups = useQuery(planReads.groups(context, ids));
  const plan = useQuery(planReads.plan(context, ids));
  const access = useContentAccess(ids.serviceTypeId);
  const writer = usePlanWriter(ids).content;
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const open = (time: PlanTime) => {
    if (!isPlaceholderId(time.id)) {
      setEditor({ kind: "edit", time });
    }
  };
  const remove = (time: PlanTime) => {
    requestTimeDelete(() => {
      void writer.deleteTime(time.id);
    });
  };
  if (times.data === undefined) {
    return (
      <View style={{ padding: 16 }}>
        <ReadStatus
          error={times.error}
          retry={() => {
            void times.refetch();
          }}
        />
      </View>
    );
  }
  const days = timeDays(times.data, zone, clock.now());
  return (
    <View style={{ flex: 1 }}>
      <Host style={{ flex: 1 }}>
        <List
          modifiers={[
            listStyle("insetGrouped"),
            scrollContentBackground("hidden"),
            background(resolvedTokenColor("surfaceCanvas", variant)),
            refreshable(async () => {
              await Promise.all([times.refetch(), groups.refetch()]);
            }),
          ]}
        >
          {access.notice === null ? null : (
            <NativeLabel font="meta">{access.notice}</NativeLabel>
          )}
          {days.map((day) => (
            <Section
              key={day.key}
              header={
                <HStack>
                  <NativeLabel font="sectionLabel" color="inkSecondary">
                    {day.label}
                  </NativeLabel>
                  <Spacer />
                  <NativeLabel font="meta" color="inkSecondary">
                    {day.relative}
                  </NativeLabel>
                </HStack>
              }
            >
              {day.times.length < 2 ? null : (
                <VStack
                  modifiers={[
                    listRowBackground(
                      resolvedTokenColor("surfaceCard", variant)
                    ),
                  ]}
                >
                  <RNHostView matchContents>
                    <TimelineTrack
                      times={day.times}
                      zone={zone}
                      onSelect={open}
                    />
                  </RNHostView>
                </VStack>
              )}
              {day.times.map((time) => (
                <TimeRow
                  key={time.id}
                  time={time}
                  groups={groups.data ?? []}
                  zone={zone}
                  canChange={
                    access.canChangeTime(time.timeType) &&
                    !isPlaceholderId(time.id)
                  }
                  canAdd={access.canAddTime}
                  onOpen={() => {
                    open(time);
                  }}
                  onDuplicate={() => {
                    setEditor({ kind: "add", template: [time] });
                  }}
                  onDelete={() => {
                    remove(time);
                  }}
                />
              ))}
            </Section>
          ))}
        </List>
      </Host>
      {times.data.length === 0 ? (
        <EmptyState
          artwork="plan"
          title="No plan times yet"
          description="Add rehearsal, service, or other times for this plan."
        />
      ) : null}
      {access.canAddTime ? (
        <FloatingGlassBar
          alignment="trailing"
          actions={[
            {
              id: "time",
              title: "Add time",
              systemImage: "plus",
              isProminent: true,
              onPress: () => {
                setEditor({ kind: "add", template: times.data ?? [] });
              },
            },
          ]}
        />
      ) : null}
      {editor === null || groups.data === undefined ? null : (
        <TimeEditor
          key={editor.kind === "edit" ? editor.time.id : "create"}
          time={editor.kind === "edit" ? editor.time : undefined}
          template={editor.kind === "add" ? editor.template : []}
          groups={groups.data}
          groupsError={groups.error}
          retryGroups={() => {
            void groups.refetch();
          }}
          zone={zone}
          now={clock.now()}
          planDate={plan.data?.sortDate ?? null}
          canChange={access.canChangeTime}
          writer={writer}
          onClose={() => {
            setEditor(null);
          }}
        />
      )}
    </View>
  );
};
