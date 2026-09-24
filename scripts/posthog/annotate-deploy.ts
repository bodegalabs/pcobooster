/**
 * Mark a verified production deploy on PostHog charts as "Deployed <sha>".
 * Runs after `verify-deployment.ts`. The deploy has already succeeded, so a missing key or a
 * PostHog failure is reported as a warning and never fails the job.
 *
 *   POSTHOG_ANNOTATION_API_KEY=phx_... bun scripts/posthog/annotate-deploy.ts <commit-sha>
 */
import { project } from "@pcobooster/analytics/reports";

const DEFAULT_HOST = "https://us.posthog.com";

export interface AnnotateDeployOptions {
  readonly sha: string;
  readonly apiKey: string | undefined;
  readonly host?: string;
  readonly now?: Date;
  readonly fetchImpl?: typeof fetch;
}

export type AnnotateDeployResult =
  | { readonly status: "created" }
  | { readonly status: "skipped" | "failed"; readonly reason: string };

export const annotateDeploy = async ({
  sha,
  apiKey,
  host = DEFAULT_HOST,
  now = new Date(),
  fetchImpl = fetch,
}: AnnotateDeployOptions): Promise<AnnotateDeployResult> => {
  if (apiKey === undefined || apiKey === "") {
    return {
      status: "skipped",
      reason: "POSTHOG_ANNOTATION_API_KEY is not set",
    };
  }
  try {
    const response = await fetchImpl(
      `${host.replace(/\/$/u, "")}/api/projects/${project.id}/annotations/`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: `Deployed ${sha}`,
          date_marker: now.toISOString(),
          scope: "project",
        }),
      }
    );
    return response.ok
      ? { status: "created" }
      : { status: "failed", reason: `PostHog returned ${response.status}` };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "request failed",
    };
  }
};

if (import.meta.main) {
  const [sha] = process.argv.slice(2);
  if (sha === undefined) {
    throw new Error("Usage: annotate-deploy.ts <commit-sha>");
  }
  const result = await annotateDeploy({
    sha,
    apiKey: process.env.POSTHOG_ANNOTATION_API_KEY,
    host: process.env.POSTHOG_HOST,
  });
  process.stdout.write(
    result.status === "created"
      ? `PostHog annotation created for ${sha}\n`
      : `::warning::PostHog deploy annotation ${result.status}: ${result.reason}\n`
  );
}
