import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { createBasicPlanningCenterClient } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import {
  PLANNING_CENTER_REQUEST_CAP,
  withPlanningCenterRequestCount,
} from "@pcobooster/api/planning-center/request-budget";
import { httpClientFor } from "@pcobooster/api/testing/http-client";
import { testPlanningCenterToken } from "@pcobooster/api/testing/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const fixture = () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      await Promise.resolve(
        Response.json({
          data: { id: "1", type: "Person", attributes: { name: "Alex" } },
        })
      )
  );
  const client = createBasicPlanningCenterClient(
    testPlanningCenterToken,
    httpClientFor(fetch)
  );
  return { client, fetch };
};

describe("standalone request budgets", () => {
  it("caps standalone concurrent HTTP attempts and gives the next invocation a fresh budget", async () => {
    const { client, fetch } = fixture();
    const program = withPlanningCenterRequestCount(
      Effect.forEach(
        Array.from(
          { length: PLANNING_CENTER_REQUEST_CAP + 1 },
          (_, index) => index
        ),
        (index) =>
          client.fetch(`/services/v2/people/${index}`).pipe(
            Effect.match({
              onSuccess: () => "sent",
              onFailure: (error) =>
                error._tag === "PlanningCenterSubrequestLimitError"
                  ? error.source
                  : error._tag,
            })
          ),
        { concurrency: "unbounded" }
      )
    );
    const first = await Effect.runPromise(program);
    expect(fetch).toHaveBeenCalledTimes(40);
    const second = await Effect.runPromise(program);
    expect(fetch).toHaveBeenCalledTimes(80);
    for (const outcomes of [first, second]) {
      expect(outcomes.filter((outcome) => outcome === "sent")).toHaveLength(40);
      expect(outcomes.filter((outcome) => outcome === "budget")).toHaveLength(
        1
      );
    }
  });

  it("retains transport accounting and its narrower cap", async () => {
    const { client, fetch } = fixture();
    const accounting = new PlanningCenterRequestAccounting({
      requestBudget: 1,
    });
    const errors = await Effect.runPromise(
      withPlanningCenterRequestCount(
        Effect.forEach([1, 2], (id) =>
          client.fetch(`/services/v2/people/${id}`).pipe(
            Effect.match({
              onSuccess: () => "sent",
              onFailure: (error) =>
                error._tag === "PlanningCenterSubrequestLimitError"
                  ? error.source
                  : error._tag,
            })
          )
        )
      ).pipe(Effect.provideService(PlanningCenterAccounting, accounting))
    );
    expect(errors).toStrictEqual(["sent", "budget"]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(accounting.requestCount).toBe(1);
  });
});
