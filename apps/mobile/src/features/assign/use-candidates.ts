import { PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE } from "@pcobooster/contracts/people";
import {
  assembleCandidateList,
  collectCandidateDetails,
  expandWindowHistory,
  needsScheduleHistory,
  planCandidateDetailsBatches,
} from "@pcobooster/planning-center-models/candidate-list";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useProductClient } from "../../app-shell/queries";
import { assignReads, candidateReadState } from "./reads";
import type { CandidateSlot } from "./reads";

export const useCandidates = (slot: CandidateSlot | null) => {
  const context = useProductClient();
  const request = slot ?? {
    serviceTypeId: "",
    planId: "",
    teamId: "",
    positionId: "",
    date: "",
  };
  const candidates = useQuery({
    ...assignReads.candidates(context, request),
    enabled: slot !== null,
  });
  const history = useQuery({
    ...assignReads.history(context, request.date),
    enabled: slot !== null,
  });
  const scheduleHistory = needsScheduleHistory(history.data);
  const options = planCandidateDetailsBatches(
    candidates.data,
    PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE
  ).map((ids) => assignReads.details(context, request, ids, scheduleHistory));
  // Batches take turns in their query function, two at a time.
  const details = useQueries({ queries: options });
  const list =
    candidates.data === undefined
      ? undefined
      : assembleCandidateList({
          candidates: candidates.data,
          windowHistory: expandWindowHistory(history.data, request.planId),
          scheduleHistory,
          details: collectCandidateDetails(details.map((query) => query.data)),
          date: request.date,
          slotTimePreferenceOptionId: request.timePreferenceOptionId,
        });
  const [released, setReleased] = useState("");
  const key = JSON.stringify([
    context.scope,
    request.teamId,
    request.positionId,
    request.planId,
  ]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setReleased(key);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [key]);
  const failed = [history, ...details].filter((query) => query.isError);
  return {
    people: list?.people ?? [],
    progress: list?.progress,
    complete: list?.complete ?? slot === null,
    ...candidateReadState({
      open: slot !== null,
      candidatesLoaded: candidates.data !== undefined,
      candidatesError: candidates.error,
      failedParts: failed.length,
      complete: list?.complete ?? true,
      released: released === key,
    }),
    retryCandidates: async () => {
      await candidates.refetch();
    },
    /** Swift's `retryFailed`: only the history and detail reads that failed. */
    retryFailed: async () => {
      await Promise.all(failed.map(async (query) => await query.refetch()));
    },
    /** Pull to refresh: candidates and history, then the details in turns. */
    refresh: async () => {
      await Promise.all([candidates.refetch(), history.refetch()]);
      await Promise.all(details.map(async (query) => await query.refetch()));
    },
  };
};
