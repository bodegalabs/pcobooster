import { partitionPeopleForRecommendationStrip } from "@pcobooster/planning-center-models/recommendation-strip-order";
import { getPositionNotificationStates } from "@pcobooster/planning-center-models/scheduling-notifications";
import type {
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer, useState } from "react";
import { ActionSheetIOS, Settings } from "react-native";

import {
  failureMessage,
  sharedReads,
  useProductClient,
} from "../../app-shell/queries";
import {
  useVisibleQuery as useQuery,
  useVisibleReadSignal,
} from "../../app-shell/visible-queries";
import { playHaptic } from "../../design/haptics";
import { useOrgTimeZone } from "../../lib/environment";
import { rosterAccess } from "../plan/access";
import type { AssignPerson } from "../plan/assign-person";
import type { RosterAssignment } from "../plan/assignment";
import { rosterAssignment } from "../plan/assignment";
import { planReads } from "../plan/reads";
import type { PlanIds } from "../plan/reads";
import type { PersonStatus } from "../plan/roster";
import { openSlots } from "../plan/roster";
import { usePlanWriter } from "../plan/use-plan-writer";
import {
  assignFailureMessage,
  nextOpenSlot,
  reconcileRoster,
  resolveSlot,
  rosterPersonFor,
  selectedSlot,
  slotKey,
} from "./presentation";
import type { ResolvedSlot } from "./presentation";
import { warmCandidates } from "./reads";
import { assignViewReducer, initialViewState } from "./state";
import { useCandidates } from "./use-candidates";

const HISTORY_KEY = "schedule-show-history";
export const useAssignModel = ({
  ids,
  groups,
  date,
  teamId,
  positionId,
}: {
  ids: PlanIds;
  groups: TeamPositionGroup[];
  date: Date;
  teamId?: string;
  positionId?: string;
}) => {
  const context = useProductClient();
  const cache = useQueryClient();
  const readSignal = useVisibleReadSignal();
  const zone = useOrgTimeZone();
  const writer = usePlanWriter(ids);
  const initial = resolveSlot(groups, teamId, positionId);
  const [view, dispatch] = useReducer(
    assignViewReducer,
    initial === undefined ? "" : slotKey(initial),
    initialViewState
  );
  const { selection, filter, selected, errors, offersNext } = view;
  const setFilter = useCallback(
    (text: string) => {
      dispatch({ kind: "filter", text });
    },
    [dispatch]
  );
  const setSelected = (id: string | null) => {
    dispatch({ kind: "inspect", id });
  };
  const dismissNext = useCallback(() => {
    dispatch({ kind: "dismissNext" });
  }, [dispatch]);
  const slot = selectedSlot(groups, selection) ?? initial;
  const [history, setHistory] = useState(
    () => Settings.get(HISTORY_KEY) !== false
  );
  /** From the stored value, so a header button rendered before the last toggle still flips it. */
  const toggleHistory = () => {
    const next = Settings.get(HISTORY_KEY) === false;
    Settings.set({ [HISTORY_KEY]: next });
    setHistory(next);
    playHaptic("selection");
  };
  const [addingPosition, setAddingPosition] = useState(false);
  const [searching, setSearching] = useState(false);
  const [scheduling, setScheduling] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState<RosterAssignment | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const access = useQuery(sharedReads.access(context));
  const accounts = useQuery(sharedReads.accounts(context));
  const features = useQuery(sharedReads.features(context));
  const { canSchedule, notice } = rosterAccess(
    access.data,
    ids.serviceTypeId,
    accounts.data?.demo ?? false
  );
  const canSearch =
    access.data === undefined || access.data.people.status === "granted";
  const slotInput =
    slot === undefined ||
    (slot.position.source !== undefined &&
      slot.position.source !== "team_position")
      ? null
      : {
          ...ids,
          teamId: slot.group.teamId,
          positionId: slot.position.id,
          date: date.toISOString(),
          timePreferenceOptionId: slot.position.timePreferenceOptionId,
        };
  const candidates = useCandidates(slotInput);
  if (slot === undefined) {
    return null;
  }
  const people = reconcileRoster(candidates.people, slot.position);
  const partition = partitionPeopleForRecommendationStrip(people, {
    settled: candidates.complete,
  });
  const matched = (person: PersonWithAvailability) =>
    person.fullName.toLowerCase().includes(filter.trim().toLowerCase());
  const addable = partition.candidates.filter(matched);
  const unavailable = partition.exceptions.filter(matched);
  const next = nextOpenSlot(groups, slot);
  const detail = people.find((person) => person.id === selected);
  const notificationStates = getPositionNotificationStates(
    groups,
    slot.group.teamId,
    slot.position.id
  );
  /** Their assignment here has a prepared, unsent scheduling email (by person id). */
  const notNotified = (personId: string) =>
    notificationStates.get(personId) === "unsent";
  const offRoster = (slot.position.filledPeople ?? []).filter(
    (person) => !partition.onSlot.some((entry) => entry.id === person.personId)
  );
  const selectSlot = (target: ResolvedSlot) => {
    playHaptic("selection");
    dispatch({ kind: "position", selection: slotKey(target) });
    if (target.position.source === "custom") {
      return;
    }
    void warmCandidates(
      context,
      cache,
      {
        ...ids,
        teamId: target.group.teamId,
        positionId: target.position.id,
        date: date.toISOString(),
      },
      readSignal()
    );
  };
  const add = (person: AssignPerson, oneOff = false) => {
    if (!canSchedule || scheduling.has(person.id)) {
      return;
    }
    const wasOpen = openSlots(slot.position);
    setScheduling((previous) => new Set([...previous, person.id]));
    void (async () => {
      const result = await writer.assign(
        person,
        slot.position,
        slot.group.teamName,
        oneOff || slot.position.source === "custom"
      );
      setScheduling((previous) => {
        const value = new Set(previous);
        value.delete(person.id);
        return value;
      });
      dispatch({
        kind: "assigned",
        selection: slotKey(slot),
        id: person.id,
        error:
          result instanceof Error
            ? assignFailureMessage(result, failureMessage)
            : null,
        offersNext:
          result === "scheduled" && wasOpen === 1 && next !== undefined,
      });
    })();
  };
  const assignmentFor = (person: FilledPositionPerson) =>
    rosterAssignment(ids, slot.position, person);
  const rosterPerson = (person: PersonWithAvailability) => {
    const scheduled = rosterPersonFor(person, slot.position);
    return scheduled === undefined ? undefined : assignmentFor(scheduled);
  };
  const editCandidate = async (
    assignment: RosterAssignment,
    status: PersonStatus | "remove"
  ) => {
    if (status !== "remove") {
      playHaptic(status === "declined" ? "warning" : "selection");
    }
    await (status === "remove"
      ? writer.remove(assignment)
      : writer.setStatus(assignment, status));
  };
  const showStatus = (assignment: RosterAssignment | undefined) => {
    if (assignment === undefined || !canSchedule) {
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: assignment.person.name,
        options: ["Cancel", "Confirmed", "Pending", "Declined", "Unschedule"],
        cancelButtonIndex: 0,
        destructiveButtonIndex: [3, 4],
      },
      (index) => {
        const statuses = ["confirmed", "pending", "declined"] as const;
        const status = statuses[index - 1];
        if (status !== undefined) {
          void editCandidate(assignment, status);
        }
        if (index === 4) {
          setSelected(null);
          setRemoving(assignment);
        }
      }
    );
  };
  const refresh = () => {
    setRefreshing(true);
    void (async () => {
      try {
        await Promise.all([
          candidates.refresh(),
          cache.invalidateQueries({
            queryKey: planReads.groups(context, ids).queryKey,
          }),
        ]);
      } catch {
        setRefreshing(false);
        return;
      }
      setRefreshing(false);
    })();
  };
  const addPosition = (name: string) => {
    const position = writer.addPosition(slot.group.teamId, name);
    if (position !== undefined) {
      selectSlot({ group: slot.group, position });
      setAddingPosition(false);
    }
  };
  return {
    addingPosition,
    setAddingPosition,
    addPosition,
    groups,
    date,
    zone,
    slot,
    history,
    toggleHistory,
    filter,
    setFilter,
    setSelected,
    searching,
    setSearching,
    scheduling,
    errors,
    offersNext,
    dismissNext,
    removing,
    setRemoving,
    refreshing,
    writer,
    features,
    canSchedule,
    canSearch,
    notice,
    candidates,
    partition,
    addable,
    unavailable,
    next,
    detail,
    offRoster,
    notNotified,
    selectSlot,
    add,
    assignmentFor,
    rosterPerson,
    editCandidate,
    showStatus,
    refresh,
  };
};
export type AssignModel = NonNullable<ReturnType<typeof useAssignModel>>;
