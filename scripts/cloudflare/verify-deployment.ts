/**
 * Wait until a deployed origin serves the expected commit from both Workers that CI redeploys
 * on every commit: the web Worker at `/version`, and the API through the web -> API binding with
 * the product RPC client's `health` call. Then check the public home page. Workers roll out gradually, so the old
 * version may answer briefly after `alchemy deploy` returns.
 *
 *   bun scripts/cloudflare/verify-deployment.ts <origin> <commit-sha>
 *
 * Behind Cloudflare Access (staging), set `CLOUDFLARE_ACCESS_CLIENT_ID` and
 * `CLOUDFLARE_ACCESS_CLIENT_SECRET` to a service token the application admits.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { makeProductClient } from "@pcobooster/client/product-client";
import { z } from "zod";

const attemptIntervalMs = 5000;
const defaultDeadlineMs = 180_000;

const webVersionResponse = z.object({ version: z.string() });

type Fetch = typeof fetch;

/**
 * The API's deployed version, or undefined until it answers `health` through the whole RPC
 * stack (the product Worker's gate and binding, the RPC route, the client's decoding).
 */
export const readVersion = async (
  origin: string,
  fetchImpl: Fetch = fetch
): Promise<string | undefined> => {
  const client = makeProductClient({
    url: `${origin}/api/rpc`,
    client: "deploy",
    credentials: "omit",
    fetch: fetchImpl,
  });
  try {
    const { version } = await client.call("health", {});
    return version;
  } catch {
    return undefined;
  } finally {
    await client.dispose();
  }
};

/** The web Worker's deployed version, or undefined until it answers. */
export const readWebVersion = async (
  origin: string,
  fetchImpl: Fetch = fetch
): Promise<string | undefined> => {
  try {
    const response = await fetchImpl(`${origin}/version`, {
      headers: { accept: "application/json" },
      redirect: "manual",
    });
    if (!response.ok) {
      return undefined;
    }
    const parsed = webVersionResponse.safeParse(await response.json());
    return parsed.success ? parsed.data.version : undefined;
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
  {
    fetchImpl = fetch,
    intervalMs = attemptIntervalMs,
    deadlineMs = defaultDeadlineMs,
  } = {}
): Promise<void> => {
  const deadline = Date.now() + deadlineMs;
  let webVersion: string | undefined;
  let apiVersion: string | undefined;
  let homeServing = false;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Polling waits for the rollout.
    [webVersion, apiVersion] = await Promise.all([
      readWebVersion(origin, fetchImpl),
      readVersion(origin, fetchImpl),
    ]);
    homeServing =
      webVersion === expectedVersion &&
      apiVersion === expectedVersion &&
      // oxlint-disable-next-line no-await-in-loop -- Polling waits for the rollout.
      (await homeIsServing(origin, fetchImpl));
    if (homeServing) {
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- Polling waits for the rollout.
    await sleep(intervalMs);
  }
  if (webVersion !== expectedVersion) {
    throw new Error(
      `${origin}/version served ${webVersion ?? "no version"}, expected ${expectedVersion}`
    );
  }
  if (apiVersion !== expectedVersion) {
    throw new Error(
      `${origin} API served ${apiVersion ?? "no healthy response"}, expected ${expectedVersion}`
    );
  }
  if (!homeServing) {
    throw new Error(`${origin}/ never returned 200`);
  }
  process.stdout.write(`${origin} serves ${expectedVersion}\n`);
};

/**
 * Sends a Cloudflare Access service token with every request when both halves are set, and
 * refuses a half-configured one rather than failing later as a login redirect.
 */
export const withAccessServiceToken = (
  fetchImpl: Fetch,
  environment: Readonly<Record<string, string | undefined>>
): Fetch => {
  const clientId = environment.CLOUDFLARE_ACCESS_CLIENT_ID ?? "";
  const clientSecret = environment.CLOUDFLARE_ACCESS_CLIENT_SECRET ?? "";
  if (clientId === "" && clientSecret === "") {
    return fetchImpl;
  }
  if (clientId === "" || clientSecret === "") {
    throw new Error(
      "Set both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET, or neither."
    );
  }
  const accessFetch = async (
    input: Parameters<Fetch>[0],
    init?: Parameters<Fetch>[1]
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("CF-Access-Client-Id", clientId);
    headers.set("CF-Access-Client-Secret", clientSecret);
    return await fetchImpl(input, { ...init, headers });
  };
  return Object.assign(accessFetch, fetchImpl);
};

if (import.meta.main) {
  const [origin, expectedVersion] = process.argv.slice(2);
  if (origin === undefined || expectedVersion === undefined) {
    throw new Error("Usage: verify-deployment.ts <origin> <commit-sha>");
  }
  await verifyDeployment(origin.replace(/\/$/u, ""), expectedVersion, {
    fetchImpl: withAccessServiceToken(fetch, process.env),
  });
}
