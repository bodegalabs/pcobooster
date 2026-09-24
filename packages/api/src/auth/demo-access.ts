/**
 * Read-only demo access. A private link carries DEMO_ACCESS_KEY once; the
 * browser then keeps only a token derived from it, so rotating the key revokes
 * every link and every demo session at once. Demo requests use the demo
 * organization's personal access token through a read-only client.
 *
 * It runs only in the API Worker; browser apps never import `packages/api`.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { readCookie } from "@pcobooster/api/http/cookies";
import type { PlanningCenterPersonalAccessToken } from "@pcobooster/api/planning-center/core-client";
import { DEMO_SESSION_COOKIE } from "@pcobooster/contracts/demo";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";

/** Long enough that the link cannot be guessed. */
const MIN_ACCESS_KEY_LENGTH = 24;
const SESSION_TOKEN_CONTEXT = "pcobooster-demo-session-v1";

export interface DemoConfiguration {
  readonly accessKey: string;
  readonly planningCenter: PlanningCenterPersonalAccessToken;
}

type DemoEnvironment = Readonly<Record<string, string | undefined>>;

/** Null unless every demo setting is present, so the demo is off by default. */
export const readDemoConfiguration = (
  environment: DemoEnvironment = process.env
): DemoConfiguration | null => {
  const accessKey = environment.DEMO_ACCESS_KEY?.trim();
  const applicationId = environment.DEMO_PLANNING_CENTER_CLIENT?.trim();
  const secret = environment.DEMO_PLANNING_CENTER_PAT?.trim();
  if (
    !isNonEmptyString(accessKey) ||
    accessKey.length < MIN_ACCESS_KEY_LENGTH ||
    !isNonEmptyString(applicationId) ||
    !isNonEmptyString(secret)
  ) {
    return null;
  }
  return { accessKey, planningCenter: { applicationId, secret } };
};

/** Digests have a fixed length, so comparison time reveals nothing. */
const matches = (candidate: string, expected: string): boolean =>
  timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest()
  );

export const isDemoAccessKey = (
  configuration: DemoConfiguration,
  candidate: string
): boolean => matches(candidate, configuration.accessKey);

export const demoSessionToken = (configuration: DemoConfiguration): string =>
  createHmac("sha256", configuration.accessKey)
    .update(SESSION_TOKEN_CONTEXT)
    .digest("base64url");

/** The demo configuration when this request carries a current demo session. */
export const resolveDemoSession = (
  request: Request,
  configuration: DemoConfiguration | null
): DemoConfiguration | null => {
  if (configuration === null) {
    return null;
  }
  const token = readCookie(request, DEMO_SESSION_COOKIE);
  return token !== null && matches(token, demoSessionToken(configuration))
    ? configuration
    : null;
};
