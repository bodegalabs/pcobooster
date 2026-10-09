import { readPlanWindowHistory } from "@pcobooster/planning-center-models/candidate-list";
import type {
  PlanWindowContinuation,
  PlanWindowHistoryBatch,
} from "@pcobooster/planning-center-models/candidate-list";
import { describe, expect, it } from "vitest";

/** A call that read `planIds`, and deferred `deferredPlanIds` to the next call. */
const windowBatch = (
  serviceTypeId: string,
  planIds: string[],
  deferredPlanIds: string[] = []
): PlanWindowHistoryBatch => ({
  plans: planIds.map((id) => ({
    id,
    title: null,
    sortDate: null,
    serviceTypeName: serviceTypeId,
  })),
  planTimes: [],
  people: [],
  loadedPlanCount: planIds.length,
  deferredPlans: deferredPlanIds.map((planId) => ({
    planId,
    serviceTypeId,
    rosterRequests: 1,
    rangeOffset: 0,
  })),
  deferredRanges: [],
});

describe(readPlanWindowHistory, () => {
  it("starts every service type's call at once and follows each one's continuation", async () => {
    const sent: string[] = [];
    const youthSent = Promise.withResolvers<null>();
    const read = async (
      serviceTypeId: string,
      continuation: PlanWindowContinuation | undefined
    ): Promise<PlanWindowHistoryBatch> => {
      const deferred = continuation?.plans.map(({ planId }) => planId) ?? [];
      sent.push(`${serviceTypeId}:${deferred.join(",") || "start"}`);
      if (serviceTypeId === "sunday" && continuation === undefined) {
        // Holds its answer until the other service type's call was sent.
        await youthSent.promise;
        return windowBatch(serviceTypeId, ["sun-1"], ["sun-2"]);
      }
      youthSent.resolve(null);
      return windowBatch(
        serviceTypeId,
        deferred.length > 0 ? deferred : ["youth-1"]
      );
    };

    const batches = await readPlanWindowHistory(["sunday", "youth"], read);

    expect({
      sent,
      plans: batches.flatMap(({ plans }) => plans.map(({ id }) => id)),
    }).toStrictEqual({
      sent: ["sunday:start", "youth:start", "sunday:sun-2"],
      plans: ["sun-1", "sun-2", "youth-1"],
    });
  });

  it("fails a service type whose follow-up call read nothing new", async () => {
    const stuck = windowBatch("sunday", [], ["sun-2"]);

    await expect(
      readPlanWindowHistory(
        ["sunday"],
        async () => await Promise.resolve(stuck)
      )
    ).rejects.toThrow("Plan window history made no progress.");
  });
});
