import { describe, expect, it } from "vitest";

import { decidePreview, decidePreviewGate } from "./preview-gate";

const startedAt = new Date("2026-09-27T04:41:17Z");
const afterStart = new Date("2026-09-27T04:43:00Z");
const daysBefore = new Date("2026-09-24T12:00:00Z");

describe(decidePreview, () => {
  it("leaves the deploy to an opened run whose preview job appeared after this run started", () => {
    expect(
      decidePreview(startedAt, [
        {
          completed: false,
          preview: {
            status: "queued",
            conclusion: null,
            createdAt: afterStart,
          },
        },
      ])
    ).toBe("leave");
    expect(
      decidePreview(startedAt, [
        {
          completed: true,
          preview: {
            status: "completed",
            conclusion: "success",
            createdAt: afterStart,
          },
        },
      ])
    ).toBe("leave");
  });

  it("waits while another run for the head hasn't created its preview job", () => {
    expect(
      decidePreview(startedAt, [{ completed: false, preview: null }])
    ).toBe("wait");
  });

  it.each(["skipped", "failure", "cancelled"])(
    "deploys when the other run's preview was %s",
    (conclusion) => {
      expect(
        decidePreview(startedAt, [
          {
            completed: true,
            preview: { status: "completed", conclusion, createdAt: afterStart },
          },
        ])
      ).toBe("deploy");
    }
  );

  it("deploys again after an earlier preview, so labeling recreates a swept preview", () => {
    expect(
      decidePreview(startedAt, [
        {
          completed: true,
          preview: {
            status: "completed",
            conclusion: "success",
            createdAt: daysBefore,
          },
        },
      ])
    ).toBe("deploy");
  });

  it("deploys when no other run exists", () => {
    expect(decidePreview(startedAt, [])).toBe("deploy");
  });
});

const githubApi = (
  siblingJobs: readonly { status: string; conclusion: string | null }[][]
) => {
  let jobReads = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/actions/runs/1")) {
      return await Promise.resolve(
        Response.json({
          workflow_id: 9,
          run_started_at: startedAt.toISOString(),
        })
      );
    }
    if (url.includes("/actions/workflows/9/runs?")) {
      return await Promise.resolve(
        Response.json({
          workflow_runs: [
            { id: 1, status: "in_progress" },
            { id: 2, status: "in_progress" },
          ],
        })
      );
    }
    if (url.includes("/actions/runs/2/jobs")) {
      const jobs = siblingJobs[Math.min(jobReads, siblingJobs.length - 1)];
      jobReads += 1;
      return await Promise.resolve(
        Response.json({
          jobs: jobs.map((job) => ({
            name: "preview",
            ...job,
            created_at: afterStart.toISOString(),
          })),
        })
      );
    }
    return await Promise.resolve(new Response("missing", { status: 404 }));
  };
  return {
    fetchImpl,
    context: {
      apiUrl: "https://api.github.test",
      repository: "owner/repo",
      runId: 1,
      head: "6ae7b92",
      token: "token",
      fetchImpl,
    },
    jobReads: () => jobReads,
  };
};

describe(decidePreviewGate, () => {
  it("polls until the other run creates its preview job, then leaves the deploy to it", async () => {
    const api = githubApi([[], [{ status: "queued", conclusion: null }]]);
    await expect(
      decidePreviewGate(api.context, { intervalMs: 0 })
    ).resolves.toBe("leave");
    expect(api.jobReads()).toBe(2);
  });

  it("deploys when the other run never decides before the deadline", async () => {
    const api = githubApi([[]]);
    await expect(
      decidePreviewGate(api.context, { intervalMs: 0, deadlineMs: 0 })
    ).resolves.toBe("deploy");
  });
});
