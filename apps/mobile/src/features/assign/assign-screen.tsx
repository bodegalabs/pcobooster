import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useProductClient } from "../../app-shell/queries";
import { ConfirmationSheet } from "../../components/confirmation-sheet";
import { EmptyState } from "../../components/empty-state";
import { FloatingGlassBar } from "../../components/floating-glass-bar";
import { ReadStatus } from "../plan/read-status";
import { planReads } from "../plan/reads";
import { AddPositionSheet } from "./add-position-sheet";
import { AssignList } from "./assign-list";
import { CandidateDetail } from "./candidate-detail";
import { slotKey } from "./presentation";
import { SomeoneElse } from "./someone-else";
import { AssignToolbar } from "./toolbar";
import { useAssignModel } from "./use-assign-model";

/** How long the next-open offer floats before it dismisses itself, as in Swift. */
const OFFER_SECONDS = 8;

/**
 * After filling a position's last slot: a floating offer to go to the next open one. Keyed by
 * that position, so a new offer restarts the timer; `onDismiss` is stable.
 */
const NextOpenOffer = ({
  name,
  onNext,
  onDismiss,
}: {
  name: string;
  onNext: () => void;
  onDismiss: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, OFFER_SECONDS * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [onDismiss]);
  // Its own provider measures this screen's safe area, which (unlike the window's) ends above
  // the tab bar, so the bar floats over the list rather than under the tabs.
  return (
    <SafeAreaProvider style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <FloatingGlassBar
        actions={[
          {
            id: "next-open",
            title: `Next: ${name}`,
            systemImage: "chevron.right",
            isProminent: true,
            onPress: onNext,
            testID: "assign-next-open-offer",
          },
          {
            id: "next-open-dismiss",
            title: "Dismiss",
            systemImage: "xmark",
            showsTitle: false,
            onPress: onDismiss,
          },
        ]}
      />
    </SafeAreaProvider>
  );
};

const AssignLoaded = (props: Parameters<typeof useAssignModel>[0]) => {
  const model = useAssignModel(props);
  if (model === null) {
    return (
      <EmptyState
        title="No slots found"
        artwork="plan"
        description="This plan has no team positions yet."
      />
    );
  }
  // Narrowed once for the callbacks below.
  const { next, detail, removing } = model;
  // Stable, so the search options and the offer's timer keep them across renders.
  const { setFilter: handleSearch, dismissNext: handleDismissNext } = model;
  return (
    <>
      <AssignList model={model} />
      <AssignToolbar
        title={model.slot.position.name}
        subtitle={`${model.slot.group.teamName} · ${formatCalendarDateLabel(model.date, model.zone, "weekdayMonthDay")}`}
        groups={model.groups}
        selection={slotKey(model.slot)}
        canAddPosition={model.canSchedule}
        onSelect={(slot) => {
          model.selectSlot(slot);
        }}
        onAddPosition={() => {
          model.setAddingPosition(true);
        }}
        history={model.history}
        onHistory={() => {
          model.toggleHistory();
        }}
        onNext={
          next === undefined
            ? undefined
            : () => {
                model.selectSlot(next);
              }
        }
        onSearch={handleSearch}
      />

      {model.offersNext && next !== undefined ? (
        <NextOpenOffer
          key={slotKey(next)}
          name={next.position.name}
          onNext={() => {
            model.selectSlot(next);
          }}
          onDismiss={handleDismissNext}
        />
      ) : null}
      {detail === undefined ? null : (
        <CandidateDetail
          person={detail}
          slot={model.slot}
          date={model.date}
          zone={model.zone}
          visible
          busy={model.scheduling.has(detail.id)}
          notNotified={model.notNotified(detail.id)}
          canSchedule={model.canSchedule}
          showsPersonLink={model.features.data?.people === true}
          onClose={() => {
            model.setSelected(null);
          }}
          onAdd={() => {
            model.add(detail);
          }}
          onStatus={() => {
            model.showStatus(model.rosterPerson(detail));
          }}
          onRemove={() => {
            model.setSelected(null);
            model.setRemoving(model.rosterPerson(detail) ?? null);
          }}
        />
      )}
      {model.addingPosition ? (
        <AddPositionSheet
          onClose={() => {
            model.setAddingPosition(false);
          }}
          onAdd={(name) => {
            model.addPosition(name);
          }}
        />
      ) : null}
      {model.searching ? (
        <SomeoneElse
          visible
          onClose={() => {
            model.setSearching(false);
          }}
          onPick={(person) => {
            model.add(person, true);
          }}
        />
      ) : null}
      <ConfirmationSheet
        visible={removing !== null}
        title={`Unschedule ${removing?.person.name ?? "this person"}?`}
        message="They come off this position in Planning Center."
        action="Unschedule"
        onCancel={() => {
          model.setRemoving(null);
        }}
        onConfirm={() => {
          if (removing !== null) {
            void model.editCandidate(removing, "remove");
          }
          model.setRemoving(null);
        }}
      />
    </>
  );
};

export const AssignScreen = () => {
  const params = useLocalSearchParams<{
    "service-type-id": string;
    "plan-id": string;
    teamId?: string;
    positionId?: string;
  }>();
  const context = useProductClient();
  const baseIds = {
    serviceTypeId: params["service-type-id"],
    planId: params["plan-id"],
  };
  const plan = useQuery(planReads.plan(context, baseIds));
  const ids = { ...baseIds, seriesId: plan.data?.seriesId ?? undefined };
  const groups = useQuery({
    ...planReads.groups(context, ids),
    enabled: plan.data !== undefined,
  });
  if (plan.data === null) {
    return (
      <EmptyState
        title="Plan unavailable"
        artwork="plan"
        description="This plan could not be loaded."
      />
    );
  }
  if (groups.data === undefined || plan.data?.sortDate === undefined) {
    return (
      <View style={{ padding: 16 }}>
        <ReadStatus
          error={groups.error ?? plan.error}
          retry={() => {
            void groups.refetch();
            void plan.refetch();
          }}
        />
      </View>
    );
  }
  return (
    <AssignLoaded
      key={`${context.scope}:${ids.planId}`}
      ids={ids}
      groups={groups.data}
      date={plan.data.sortDate}
      teamId={params.teamId}
      positionId={params.positionId}
    />
  );
};
