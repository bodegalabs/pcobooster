/**
 * Decide whether a `labeled` CI run deploys its pull request's preview. Opening a PR with the
 * `preview` label (`gh pr create --label preview`) sends `opened` and `labeled` together, and
 * the `opened` run already deploys the head once its checks pass. The `labeled` run leaves the
 * deploy to a run whose `preview` job for this head appeared after it started. Earlier preview
 * jobs don't count, so labeling again still recreates a preview the nightly sweep removed.
 *
 *   bun scripts/cloudflare/preview-gate.ts
 *
 * Reads `GITHUB_API_URL`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GH_TOKEN`, and
 * `EXPECTED_HEAD`, and writes `deploy=true` or `deploy=false` to `GITHUB_OUTPUT`.
 */
import { appendFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { Schema } from "effect";

const attemptIntervalMs = 5000;
/** Another run's preview job appears seconds after its checks pass; this is a generous cap. */
const defaultDeadlineMs = 120_000;

export interface PreviewJob {
  status: string;
  conclusion: string | null;
  createdAt: Date;
}

/** Another CI run for the same head, and its `preview` job once GitHub has created it. */
export interface SiblingRun {
  completed: boolean;
  preview: PreviewJob | null;
}

export type PreviewGateDecision = "deploy" | "leave" | "wait";

const isDeploying = (job: PreviewJob) =>
  job.status !== "completed" || job.conclusion === "success";

export const decidePreview = (
  startedAt: Date,
  siblings: readonly SiblingRun[]
): PreviewGateDecision => {
  const deployingNow = siblings.some(
    ({ preview }) =>
      preview !== null &&
      preview.createdAt.getTime() >= startedAt.getTime() &&
      isDeploying(preview)
  );
  if (deployingNow) {
    return "leave";
  }
  // GitHub creates a dependent job only once its needs finish, so a running sibling without
  // a preview job hasn't decided yet.
  const undecided = siblings.some(
    (sibling) => !sibling.completed && sibling.preview === null
  );
  return undecided ? "wait" : "deploy";
};

const runSchema = Schema.Struct({
  workflow_id: Schema.Number,
  run_started_at: Schema.String,
});

const runsSchema = Schema.Struct({
  workflow_runs: Schema.Array(
    Schema.Struct({ id: Schema.Number, status: Schema.String })
  ),
});

const jobsSchema = Schema.Struct({
  jobs: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      status: Schema.String,
      conclusion: Schema.NullOr(Schema.String),
      created_at: Schema.String,
    })
  ),
});

type Fetch = typeof fetch;

interface GateContext {
  apiUrl: string;
  repository: string;
  runId: number;
  head: string;
  token: string;
  fetchImpl?: Fetch;
}

const getJson = async <T>(
  { apiUrl, repository, token, fetchImpl = fetch }: GateContext,
  path: string,
  schema: Schema.Codec<T, unknown>
): Promise<T> => {
  const response = await fetchImpl(`${apiUrl}/repos/${repository}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${path} answered ${response.status}`);
  }
  return Schema.decodeUnknownSync(schema)(await response.json());
};

const readSiblings = async (
  context: GateContext,
  workflowId: number
): Promise<SiblingRun[]> => {
  const { workflow_runs: runs } = await getJson(
    context,
    `/actions/workflows/${workflowId}/runs?event=pull_request&head_sha=${context.head}&per_page=100`,
    runsSchema
  );
  const siblings = runs.filter((run) => run.id !== context.runId);
  return await Promise.all(
    siblings.map(async (run) => {
      const { jobs } = await getJson(
        context,
        `/actions/runs/${run.id}/jobs?per_page=100`,
        jobsSchema
      );
      const preview = jobs.find((job) => job.name === "preview");
      return {
        completed: run.status === "completed",
        preview: preview
          ? {
              status: preview.status,
              conclusion: preview.conclusion,
              createdAt: new Date(preview.created_at),
            }
          : null,
      };
    })
  );
};

/** Whether this run deploys, polling while another run hasn't decided yet. */
export const decidePreviewGate = async (
  context: GateContext,
  {
    intervalMs = attemptIntervalMs,
    deadlineMs = defaultDeadlineMs,
  }: { intervalMs?: number; deadlineMs?: number } = {}
): Promise<"deploy" | "leave"> => {
  const run = await getJson(
    context,
    `/actions/runs/${context.runId}`,
    runSchema
  );
  // The current attempt's start, so re-running this run deploys again.
  const startedAt = new Date(run.run_started_at);
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Polling waits for the other run to decide.
    const siblings = await readSiblings(context, run.workflow_id);
    const decision = decidePreview(startedAt, siblings);
    if (decision !== "wait") {
      return decision;
    }
    if (Date.now() >= deadline) {
      // Deploying twice is harmless; skipping a wanted preview is not.
      return "deploy";
    }
    // oxlint-disable-next-line no-await-in-loop -- Polling waits for the other run to decide.
    await sleep(intervalMs);
  }
};

const requiredEnv = (name: string): string => {
  const value = process.env[name] ?? "";
  if (value === "") {
    throw new Error(`Set ${name}.`);
  }
  return value;
};

if (import.meta.main) {
  const decision = await decidePreviewGate({
    apiUrl: requiredEnv("GITHUB_API_URL"),
    repository: requiredEnv("GITHUB_REPOSITORY"),
    runId: Number(requiredEnv("GITHUB_RUN_ID")),
    head: requiredEnv("EXPECTED_HEAD"),
    token: requiredEnv("GH_TOKEN"),
  });
  process.stdout.write(
    decision === "deploy"
      ? "No other run is deploying this head; deploying the preview.\n"
      : "Another run is deploying this head; skipping this preview.\n"
  );
  await appendFile(
    requiredEnv("GITHUB_OUTPUT"),
    `deploy=${decision === "deploy"}\n`
  );
}
