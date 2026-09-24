/**
 * Destroy pull request stages whose pull request is no longer open, and stages of open pull
 * requests that have gone 3 days without a deploy (the next push redeploys them). The close-time
 * cleanup job is the normal path; this sweep catches cancelled runs, failed teardowns, and idle
 * previews.
 *
 *   bun scripts/cloudflare/sweep-previews.ts [--dry-run]
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_TOKEN, GITHUB_REPOSITORY.
 */
import { spawnSync } from "node:child_process";

import { z } from "zod";

import type { CloudflareResource } from "./stages";
import { previewStages, sweepDecision } from "./stages";

const cloudflareApi = "https://api.cloudflare.com/client/v4";
const d1PageSize = 100;
const dryRun = process.argv.includes("--dry-run");

const required = (name: string): string => {
  const value = process.env[name] ?? "";
  if (value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
};

const cloudflareToken = required("CLOUDFLARE_API_TOKEN");
const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const githubToken = required("GITHUB_TOKEN");
const repository = required("GITHUB_REPOSITORY");

const cloudflareResponse = z.object({
  success: z.boolean(),
  errors: z.array(z.unknown()),
  result: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().optional(),
      modified_on: z.iso.datetime({ offset: true }).optional(),
      created_at: z.iso.datetime({ offset: true }).optional(),
    })
  ),
  result_info: z.object({ total_pages: z.number().optional() }).optional(),
});

const cloudflareList = async (path: string) => {
  const response = await fetch(`${cloudflareApi}${path}`, {
    headers: { authorization: `Bearer ${cloudflareToken}` },
  });
  const body = cloudflareResponse.parse(await response.json());
  if (!body.success) {
    throw new Error(`GET ${path} failed: ${JSON.stringify(body.errors)}`);
  }
  return body;
};

const workers = async (): Promise<CloudflareResource[]> => {
  const body = await cloudflareList(`/accounts/${accountId}/workers/scripts`);
  return body.result.flatMap((script) =>
    script.id === undefined || script.modified_on === undefined
      ? []
      : [{ name: script.id, changedAt: new Date(script.modified_on) }]
  );
};

const databases = async (): Promise<CloudflareResource[]> => {
  const found: CloudflareResource[] = [];
  for (let page = 1; ; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Cloudflare pages must be read in order.
    const body = await cloudflareList(
      `/accounts/${accountId}/d1/database?name=pcobooster-pr-&per_page=${d1PageSize}&page=${page}`
    );
    found.push(
      ...body.result.flatMap((database) =>
        database.name === undefined || database.created_at === undefined
          ? []
          : [{ name: database.name, changedAt: new Date(database.created_at) }]
      )
    );
    if (page >= (body.result_info?.total_pages ?? 1)) {
      return found;
    }
  }
};

const pullRequestState = z.object({ state: z.enum(["open", "closed"]) });

const isOpen = async (pullRequest: number): Promise<boolean> => {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/pulls/${pullRequest}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${githubToken}`,
      },
    }
  );
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(
      `Reading pull request #${pullRequest} failed: ${response.status}`
    );
  }
  return pullRequestState.parse(await response.json()).state === "open";
};

const destroy = (pullRequest: number): boolean => {
  const result = spawnSync(
    "bun",
    [
      "run",
      "alchemy",
      "destroy",
      "alchemy.cleanup.ts",
      "--stage",
      `pr-${pullRequest}`,
      "--no-input",
      "--yes",
    ],
    { stdio: "inherit" }
  );
  return result.status === 0;
};

const resources = await Promise.all([workers(), databases()]);
const now = new Date();
const failed: number[] = [];
for (const stage of previewStages(resources.flat())) {
  const { pullRequest } = stage;
  // oxlint-disable-next-line no-await-in-loop -- Stages are checked and destroyed one at a time.
  const decision = sweepDecision(stage, await isOpen(pullRequest), now);
  process.stdout.write(
    `pr-${pullRequest} (last deployed ${stage.lastDeployedAt.toISOString()}): ${decision}\n`
  );
  if (decision !== "keep" && !dryRun && !destroy(pullRequest)) {
    failed.push(pullRequest);
  }
}
if (failed.length > 0) {
  throw new Error(
    `Failed to destroy: ${failed.map((n) => `pr-${n}`).join(", ")}`
  );
}
