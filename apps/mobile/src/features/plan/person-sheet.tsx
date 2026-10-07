import { Host, Picker, Text as SwiftText } from "@expo/ui/swift-ui";
import { disabled, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { describeSchedulingNotification } from "@pcobooster/planning-center-models/scheduling-notifications";
import type { FilledPositionPerson } from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, ScrollView, View } from "react-native";

import { sharedReads, useProductClient } from "../../app-shell/queries";
import { BottomActionBar } from "../../components/bottom-action-bar";
import { EmptyState } from "../../components/empty-state";
import { PersonAvatar } from "../../components/person-avatar";
import { PillButton } from "../../components/pill-button";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { playHaptic } from "../../design/haptics";
import { scheduleStatusLabel, scheduleStatuses } from "../../design/status";
import { useOrgTimeZone } from "../../lib/environment";
import { useToasts } from "../../lib/toasts";
import { rosterAccess } from "./access";
import { PersonDraft } from "./person-draft";
import { ReadStatus } from "./read-status";
import { planReads } from "./reads";
import type { PlanIds } from "./reads";
import { personStatus } from "./roster";
import type { PersonStatus } from "./roster";
import { usePlanWriter } from "./use-plan-writer";

const PersonEditor = ({
  ids,
  person,
  caption,
  canSchedule,
}: {
  ids: PlanIds;
  person: FilledPositionPerson;
  caption: string;
  canSchedule: boolean;
}) => {
  const draft = useRef<PersonDraft | null>(null);
  const initialPerson = useRef(person);

  const [status, setStatus] = useState(() => personStatus(person));
  const writer = usePlanWriter(ids);
  const router = useRouter();
  const zone = useOrgTimeZone();
  const toasts = useToasts();
  const notification = describeSchedulingNotification(
    person.notification,
    zone
  );
  useEffect(() => {
    const editor = new PersonDraft(initialPerson.current);
    draft.current = editor;
    return () => {
      void editor.commit(writer);
    };
  }, [writer]);
  const remove = () => {
    Alert.alert(
      `Unschedule ${person.name}?`,
      "They come off this position in Planning Center.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unschedule",
          style: "destructive",
          onPress: () => {
            draft.current?.discard();
            router.back();
            void writer.remove(person);
          },
        },
      ]
    );
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <Stack.Screen
        options={{
          title: "",
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: "Close",
              icon: { type: "sfSymbol", name: "xmark" },
              onPress: () => {
                router.back();
              },
            },
          ],
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
            paddingVertical: 8,
          }}
        >
          <PersonAvatar
            name={person.name}
            photoUrl={person.photoThumbnailUrl}
            size="hero"
            status={status}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText font="pageTitle">{person.name}</AppText>
            <AppText font="rowDetail" color={colors.inkSecondary}>
              {caption}
            </AppText>
          </View>
        </View>
        <AppText font="sectionLabel" color={colors.inkSecondary}>
          Status
        </AppText>
        <SurfaceCard contentStyle={{ gap: 12 }}>
          <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
            <Picker
              selection={status}
              onSelectionChange={(next: PersonStatus) => {
                if (draft.current !== null) {
                  draft.current.status = next;
                }
                setStatus(next);
                playHaptic(next === "declined" ? "warning" : "selection");
              }}
              modifiers={[pickerStyle("segmented"), disabled(!canSchedule)]}
            >
              {scheduleStatuses.map((value) => (
                <SwiftText key={value} modifiers={[tag(value)]}>
                  {scheduleStatusLabel[value]}
                </SwiftText>
              ))}
            </Picker>
          </Host>
          {status === "declined" ? (
            <AppText font="meta" color={colors.inkSecondary}>
              Declining takes them off this position. They stay in Assign as
              declined.
            </AppText>
          ) : null}
          {notification === null ? null : (
            <AppText font="meta" color={colors.inkSecondary}>
              {notification}
            </AppText>
          )}
        </SurfaceCard>
        {person.personId === null || person.personId === undefined ? null : (
          <PillButton
            title="Open in Planning Center"
            kind="outline"
            onPress={() => {
              void (async () => {
                try {
                  await Linking.openURL(
                    `https://people.planningcenteronline.com/people/AC${encodeURIComponent(person.personId ?? "")}`
                  );
                } catch {
                  toasts.showError("Couldn't open Planning Center.");
                }
              })();
            }}
          />
        )}
      </ScrollView>
      {canSchedule ? (
        <BottomActionBar
          actions={[
            {
              title: "Unschedule",
              role: "destructive",
              systemImage: "trash",
              onPress: remove,
            },
          ]}
        />
      ) : null}
    </View>
  );
};

export const LineupPersonSheet = () => {
  const { serviceTypeId, planId, planPersonId } = useLocalSearchParams<{
    serviceTypeId: string;
    planId: string;
    planPersonId: string;
  }>();
  const context = useProductClient();
  const plan = useQuery(planReads.plan(context, { serviceTypeId, planId }));
  const ids = {
    serviceTypeId,
    planId,
    seriesId: plan.data?.seriesId ?? undefined,
  };
  const query = useQuery({
    ...planReads.groups(context, ids),
    enabled: plan.data !== undefined,
  });
  const access = useQuery(planReads.access(context));
  const accounts = useQuery(sharedReads.accounts(context));
  const { canSchedule } = rosterAccess(
    access.data,
    serviceTypeId,
    accounts.data?.demo ?? false
  );
  const group = query.data?.find((candidate) =>
    candidate.positions.some((position) =>
      (position.filledPeople ?? []).some(
        (person) => person.planPersonId === planPersonId
      )
    )
  );
  const position = group?.positions.find((candidate) =>
    (candidate.filledPeople ?? []).some(
      (person) => person.planPersonId === planPersonId
    )
  );
  const person = position?.filledPeople?.find(
    (candidate) => candidate.planPersonId === planPersonId
  );
  if (person === undefined && query.data !== undefined) {
    return (
      <EmptyState
        artwork="plan"
        title="Assignment unavailable"
        description="This person is no longer in the lineup."
      />
    );
  }
  if (person === undefined) {
    return (
      <View style={{ padding: 16 }}>
        <ReadStatus
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      </View>
    );
  }
  return (
    <PersonEditor
      key={planPersonId}
      ids={ids}
      person={person}
      canSchedule={canSchedule}
      caption={`${group?.teamName ?? ""} · ${position?.name ?? ""}`}
    />
  );
};
