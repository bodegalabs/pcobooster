import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { failureMessage } from "../../app-shell/queries";
import { EmptyState } from "../../components/empty-state";
import { Glyph } from "../../components/glyph";
import { Hairline } from "../../components/hairline";
import { InfoBanner } from "../../components/info-banner";
import { PillButton } from "../../components/pill-button";
import { ProgressCapsule } from "../../components/progress-capsule";
import { SectionHeader } from "../../components/section-header";
import { SurfaceColorProvider } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import type { ScheduleStatus } from "../../design/status";
import { ReadStatus } from "../plan/read-status";
import { filled, openSlots } from "../plan/roster";
import { useOpenPlanningCenterPerson } from "../plan/roster-links";
import { CandidateMenu } from "./candidate-menu";
import { CandidatePreview } from "./candidate-preview";
import { CandidateRow } from "./candidate-row";
import { CandidateSwipe } from "./candidate-swipe";
import {
  candidatePresentation,
  emptyCandidatesMessage,
  someoneElseDisabledReason,
} from "./presentation";
import {
  OffRosterRow,
  OpenSlotsRow,
  SlotStepper,
  SomeoneElseRow,
} from "./slot-rows";
import type { AssignModel } from "./use-assign-model";

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 12,
  },
  section: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 26,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 10,
    minHeight: 32,
    justifyContent: "space-between",
    flexDirection: "row",
    alignItems: "center",
  },
  error: {
    flexDirection: "row",
    gap: 6,
    paddingLeft: 68,
    paddingRight: 16,
    paddingBottom: 12,
  },
});

/** One candidate: swipe actions, the long-press menu and preview, the row, and its add error. */
const CandidateListRow = ({
  model,
  person,
}: {
  model: AssignModel;
  person: PersonWithAvailability;
}) => {
  const { slot, date, zone, canSchedule } = model;
  const router = useRouter();
  const openPlanningCenterPerson = useOpenPlanningCenterPerson();
  const presentation = candidatePresentation(person, slot, date, zone);
  const error = model.errors.get(person.id);
  const add = () => {
    model.add(person);
  };
  const details = () => {
    model.setSelected(person.id);
  };
  const setStatus = (status: ScheduleStatus) => {
    const scheduled = model.rosterPerson(person);
    if (scheduled !== undefined) {
      void model.editCandidate(scheduled, status);
    }
  };
  const remove = () => {
    model.setRemoving(model.rosterPerson(person) ?? null);
  };
  return (
    <>
      <CandidateSwipe
        id={person.id}
        canSchedule={canSchedule}
        canAdd={presentation.disabledReason === undefined}
        status={presentation.status}
        onAdd={add}
        onStatus={setStatus}
        onRemove={remove}
      >
        <CandidateMenu
          presentation={presentation}
          positionName={slot.position.name}
          canSchedule={canSchedule}
          showsPersonLink={model.features.data?.people === true}
          onAdd={add}
          onStatus={setStatus}
          onRemove={remove}
          onDetails={details}
          onViewPerson={() => {
            router.push(`/people/${person.id}`);
          }}
          onOpenPlanningCenter={() => {
            openPlanningCenterPerson(person.id);
          }}
          preview={
            <CandidatePreview
              person={person}
              presentation={presentation}
              positionName={slot.position.name}
              date={date}
              zone={zone}
            />
          }
        >
          <CandidateRow
            person={person}
            presentation={presentation}
            date={date}
            zone={zone}
            history={model.history}
            notNotified={model.notNotified(person.id)}
            canSchedule={canSchedule}
            busy={model.scheduling.has(person.id)}
            onDetails={details}
            onAdd={add}
            onStatus={() => {
              const scheduled = model.rosterPerson(person);
              if (scheduled === undefined) {
                details();
              } else {
                model.showStatus(scheduled);
              }
            }}
          />
        </CandidateMenu>
      </CandidateSwipe>
      {error === undefined ? null : (
        <View style={styles.error}>
          <Glyph symbol="alert" size={13} color={colors.destructive} />
          <AppText font="meta" color={colors.destructive} style={{ flex: 1 }}>
            {error}
          </AppText>
        </View>
      )}
      <Hairline inset={24} trailing={16} />
    </>
  );
};

/**
 * The candidate list for the open position (Swift `AssignCandidateList`): Scheduled (on the
 * slot, off-roster people, then the open slots), Add someone (ending with Someone else), and
 * Unavailable.
 */
export const AssignList = ({ model }: { model: AssignModel }) => {
  const { slot, candidates, canSchedule, refresh } = model;
  const open = openSlots(slot.position);
  const row = (person: PersonWithAvailability) => (
    <CandidateListRow key={person.id} model={model} person={person} />
  );
  return (
    <ScrollView
      testID="assign-screen"
      style={{ backgroundColor: colors.surfaceCanvas }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={model.refreshing} onRefresh={refresh} />
      }
      keyboardShouldPersistTaps="handled"
    >
      {model.notice === null ? null : (
        <InfoBanner
          message={`${model.notice.title}. ${model.notice.message}`}
        />
      )}
      {candidates.showsProgress && candidates.progress !== undefined ? (
        <ProgressCapsule
          completed={
            candidates.progress.detailedCount +
            Number(candidates.progress.historyLoaded)
          }
          total={candidates.progress.candidateCount + 1}
          label="Loading history and availability"
        />
      ) : null}
      {candidates.failedParts > 0 ? (
        <InfoBanner
          tone="destructive"
          message="Some history or availability failed to load."
          action={
            <PillButton
              title="Retry"
              kind="outline"
              size="small"
              testID="assign-retry"
              onPress={() => {
                void candidates.retryFailed();
              }}
            />
          }
        />
      ) : null}
      {candidates.candidatesError === null ? (
        <>
          <View>
            <View style={styles.header}>
              <SectionHeader title="Scheduled" />
              <SlotStepper
                slot={slot}
                writer={model.writer}
                canSchedule={canSchedule}
              />
            </View>
            <SurfaceColorProvider value="surfaceCard">
              <View style={styles.section}>
                {model.partition.onSlot.map(row)}
                {model.offRoster.map((person) => (
                  <OffRosterRow
                    key={person.planPersonId}
                    person={person}
                    notNotified={model.notNotified(
                      person.personId ?? person.id
                    )}
                    onStatus={() => {
                      model.showStatus(model.assignmentFor(person));
                    }}
                  />
                ))}
                {open > 0 || filled(slot.position) === 0 ? (
                  <OpenSlotsRow open={open} />
                ) : null}
              </View>
            </SurfaceColorProvider>
          </View>
          <View>
            <View style={[styles.header, { alignItems: "flex-end" }]}>
              <SectionHeader title="Add someone" count={model.addable.length} />
            </View>
            <SurfaceColorProvider value="surfaceCard">
              <View style={styles.section}>
                {candidates.loading ? (
                  <View style={{ padding: 24 }}>
                    <ReadStatus error={null} retry={refresh} />
                  </View>
                ) : (
                  model.addable.map(row)
                )}
                {!candidates.loading && model.addable.length === 0 ? (
                  <AppText
                    font="rowDetail"
                    color={colors.inkSecondary}
                    style={{ padding: 16 }}
                  >
                    {emptyCandidatesMessage(slot.position, model.filter)}
                  </AppText>
                ) : null}
                <SomeoneElseRow
                  disabledReason={someoneElseDisabledReason(
                    canSchedule,
                    model.canSearch
                  )}
                  onPress={() => {
                    model.setSearching(true);
                  }}
                />
              </View>
            </SurfaceColorProvider>
          </View>
          {model.unavailable.length === 0 ? null : (
            <View>
              <View style={[styles.header, { alignItems: "flex-end" }]}>
                <SectionHeader
                  title="Unavailable"
                  count={model.unavailable.length}
                />
              </View>
              <SurfaceColorProvider value="surfaceCard">
                <View style={styles.section}>{model.unavailable.map(row)}</View>
              </SurfaceColorProvider>
            </View>
          )}
        </>
      ) : (
        <EmptyState
          title="Couldn't load people"
          artwork="alert"
          description={failureMessage(candidates.candidatesError)}
          actions={
            <PillButton
              title="Try Again"
              kind="secondary"
              onPress={() => {
                void candidates.retryCandidates();
              }}
            />
          }
        />
      )}
    </ScrollView>
  );
};
