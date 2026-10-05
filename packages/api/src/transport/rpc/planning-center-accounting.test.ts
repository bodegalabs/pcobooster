import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { PLANNING_CENTER_REQUEST_CAP } from "@pcobooster/api/planning-center/request-budget";
import { recordLogs } from "@pcobooster/api/testing/logs";
import type { LoggedLine } from "@pcobooster/api/testing/logs";
import { accountPlanningCenterProcedure } from "@pcobooster/api/transport/rpc/planning-center-accounting";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const recordingLogger = () => {
  const { lines: logged, capture } = recordLogs();
  const lines: Pick<LoggedLine, "message" | "fields">[] = [];
  const writeLog = (line: Effect.Effect<void>) => {
    Effect.runSync(capture(line));
    for (const { message, fields } of logged.splice(0)) {
      lines.push({ message, fields });
    }
  };
  return { lines, writeLog };
};

/** A clock that advances 25 ms per reading. */
const steppingClock = () => {
  let now = 0;
  return () => {
    now += 25;
    return now;
  };
};

const procedure = {
  procedure: "people.planWindowHistory",
  requestId: "request-1",
};

describe(accountPlanningCenterProcedure, () => {
  it("logs one summary for a procedure that called Planning Center", async () => {
    const { lines, writeLog } = recordingLogger();
    const result = await accountPlanningCenterProcedure(
      procedure,
      async (accounting) => {
        accounting.recordRequest();
        accounting.recordRequest();
        accounting.recordPaced(400);
        accounting.recordRateLimited();
        return await Promise.resolve("done");
      },
      { writeLog, requestBudget: 40, now: steppingClock() }
    );
    expect(result).toBe("done");
    expect(lines).toStrictEqual([
      {
        message: "Planning Center procedure summary",
        fields: {
          procedure: "people.planWindowHistory",
          requestId: "request-1",
          priority: "interactive",
          durationMs: 25,
          outcome: "success",
          planningCenter: {
            requests: 2,
            pacedRequests: 1,
            pacedWaitMs: 400,
            rateLimited: 1,
            rateLimitRejections: 0,
            subrequestLimitHits: 0,
            requestBudget: 40,
          },
        },
      },
    ]);
  });

  it("logs the summary of a failed procedure and rethrows", async () => {
    const { lines, writeLog } = recordingLogger();
    const failure = new Error("provider down");
    await expect(
      accountPlanningCenterProcedure(
        procedure,
        async (accounting) => {
          accounting.recordRequest();
          await Promise.reject(failure);
        },
        { writeLog, now: steppingClock() }
      )
    ).rejects.toBe(failure);
    expect(lines).toMatchObject([
      {
        fields: {
          outcome: "failure",
          planningCenter: {
            requests: 1,
            requestBudget: PLANNING_CENTER_REQUEST_CAP,
          },
        },
      },
    ]);
  });

  it("caps every procedure's Planning Center requests below the Workers Free subrequest limit", async () => {
    let received: PlanningCenterRequestAccounting | undefined;
    await accountPlanningCenterProcedure(procedure, async (accounting) => {
      received = accounting;
      await Promise.resolve();
    });
    expect({
      cap: PLANNING_CENTER_REQUEST_CAP,
      requestBudget: received?.requestBudget,
    }).toStrictEqual({ cap: 40, requestBudget: 40 });
  });

  it("gives the pacer and the summary the browser's priority", async () => {
    const { lines, writeLog } = recordingLogger();
    let received: PlanningCenterRequestAccounting | undefined;
    await accountPlanningCenterProcedure(
      { ...procedure, priority: "speculative" },
      async (accounting) => {
        received = accounting;
        accounting.recordRateLimitRejection();
        await Promise.resolve();
      },
      { writeLog }
    );
    expect(received?.priority).toBe("speculative");
    expect(lines).toMatchObject([
      {
        fields: {
          priority: "speculative",
          planningCenter: { requests: 0, rateLimitRejections: 1 },
        },
      },
    ]);
  });

  it("stays quiet for procedures that never called Planning Center", async () => {
    const { lines, writeLog } = recordingLogger();
    await accountPlanningCenterProcedure(
      procedure,
      async () => {
        await Promise.resolve();
      },
      { writeLog }
    );
    expect(lines).toStrictEqual([]);
  });

  it("reuses accounting that an outer middleware already provides", async () => {
    const { lines, writeLog } = recordingLogger();
    const existing = new PlanningCenterRequestAccounting();
    let received: PlanningCenterRequestAccounting | undefined;
    await accountPlanningCenterProcedure(
      { ...procedure, accounting: existing },
      async (accounting) => {
        received = accounting;
        accounting.recordRequest();
        await Promise.resolve();
      },
      { writeLog }
    );
    expect(received).toBe(existing);
    expect(lines).toStrictEqual([]);
  });
});
