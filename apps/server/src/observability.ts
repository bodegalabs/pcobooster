import type * as Cloudflare from "alchemy/Cloudflare";

/**
 * Share of production invocations that record a trace. Traces count against the same Workers
 * Free quota as logs (200,000 events a day), and one traced request records a span for every
 * Planning Center, D1, and KV subrequest, so production samples while previews trace
 * everything.
 */
const productionTraceSamplingRate = 0.2;

/**
 * Workers Logs as Alchemy enables them by default, plus Workers Traces. Traces show each
 * invocation's subrequests, which is how to see which procedures approach the 50-subrequest
 * limit (AGENTS.md, Request Budget).
 */
export const workerObservability = (
  production: boolean
): Cloudflare.Workers.WorkerObservability => ({
  enabled: true,
  logs: { enabled: true, invocationLogs: true },
  traces: {
    enabled: true,
    headSamplingRate: production ? productionTraceSamplingRate : 1,
  },
});
