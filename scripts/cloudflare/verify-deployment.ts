/**
 * Wait until a deployed origin serves the expected commit through the web -> API binding,
 * then check the public home page. Workers roll out gradually, so the old version may answer
 * briefly after `alchemy deploy` returns.
 *
 *   bun scripts/cloudflare/verify-deployment.ts <origin> <commit-sha>
 */
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

const attemptIntervalMs = 5000;
const deadlineMs = 180_000;

const rpcHealthResponse = z.object({
  json: z.object({ status: z.literal("ok"), version: z.string() }),
});

type Fetch = typeof fetch;

/** The deployed version, or undefined until the origin answers with a healthy oRPC reply. */
export const readVersion = async (
  origin: string,
  fetchImpl: Fetch = fetch
): Promise<string | undefined> => {
  try {
    const response = await fetchImpl(`${origin}/api/rpc/health`, {
      body: JSON.stringify({ json: {} }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      return undefined;
    }
    const parsed = rpcHealthResponse.safeParse(await response.json());
    return parsed.success ? parsed.data.json.version : undefined;
  } catch {
    return undefined;
  }
};

/** Whether the public home page answers 200; it can trail the API during a rollout. */
const homeIsServing = async (
  origin: string,
  fetchImpl: Fetch
): Promise<boolean> => {
  try {
    const home = await fetchImpl(origin, { redirect: "manual" });
    return home.status === 200;
  } catch {
    return false;
  }
};

export const verifyDeployment = async (
  origin: string,
  expectedVersion: string,
  { fetchImpl = fetch, intervalMs = attemptIntervalMs } = {}
): Promise<void> => {
  const deadline = Date.now() + deadlineMs;
  let lastVersion: string | undefined;
  let homeServing = false;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Polling waits for the rollout.
    lastVersion = await readVersion(origin, fetchImpl);
    homeServing =
      lastVersion === expectedVersion &&
      // oxlint-disable-next-line no-await-in-loop -- Polling waits for the rollout.
      (await homeIsServing(origin, fetchImpl));
    if (homeServing) {
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- Polling waits for the rollout.
    await sleep(intervalMs);
  }
  if (lastVersion !== expectedVersion) {
    throw new Error(
      `${origin} served ${lastVersion ?? "no healthy response"}, expected ${expectedVersion}`
    );
  }
  if (!homeServing) {
    throw new Error(`${origin}/ never returned 200`);
  }
  process.stdout.write(`${origin} serves ${expectedVersion}\n`);
};

if (import.meta.main) {
  const [origin, expectedVersion] = process.argv.slice(2);
  if (origin === undefined || expectedVersion === undefined) {
    throw new Error("Usage: verify-deployment.ts <origin> <commit-sha>");
  }
  await verifyDeployment(origin.replace(/\/$/u, ""), expectedVersion);
}
