import { setTimeout as sleep } from "node:timers/promises";

import type { Auth } from "@pcobooster/api/auth";
import { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";

/** A linked account row as Better Auth stores it, tokens included. */
export interface StoredPlanningCenterAccount {
  readonly id: string;
  readonly accountId: string;
  readonly providerId: string;
  readonly userId: string;
  readonly createdAt: Date | string;
  readonly accessToken?: string | null;
  readonly accessTokenExpiresAt?: Date | string | null;
  readonly scope?: string | null;
}

export interface PlanningCenterToken {
  readonly accessToken: string;
  readonly scopes: string[];
}

export interface TokenApi {
  /** The user's linked accounts, read once per request. */
  readonly findAccounts: (
    userId: string
  ) => Promise<readonly StoredPlanningCenterAccount[]>;
  /** Better Auth's token read, which refreshes and stores a token that is about to expire. */
  readonly refresh: (
    userId: string,
    accountRowId: string
  ) => Promise<{ accessToken: string; scopes: string[] }>;
  /** Waits before re-reading a token another request is storing. */
  readonly sleep: (ms: number) => Promise<void>;
}

/** Better Auth refreshes a token this close to expiry; reading it directly stops sooner. */
const EXPIRY_MARGIN_MS = 5000;
/**
 * When a refresh is refused, how long to wait before each re-read of the stored token. A page
 * opens with many parallel requests, and when the token has expired each of them refreshes it;
 * Planning Center issues a new refresh token every time, so all but the first can be refused
 * while the first is still storing its token.
 */
const REREAD_DELAYS_MS = [0, 500, 1500] as const;

/**
 * `auth.ts` leaves Better Auth's `encryptOAuthTokens` off, so stored tokens are plain text and
 * can be sent as they are. Turning encryption on means reading them through Better Auth.
 */
export const createAuthTokenApi = (auth: Auth): TokenApi => ({
  findAccounts: async (userId) => {
    const context = await auth.$context;
    return await context.internalAdapter.findAccounts(userId);
  },
  // No headers: a server call names its user, so Better Auth skips its own session lookup.
  refresh: async (userId, accountRowId) =>
    await auth.api.getAccessToken({
      body: { accountId: accountRowId, userId },
    }),
  sleep: async (ms) => {
    await sleep(ms);
  },
});

/** Better Auth stores scopes comma-separated. */
const storedScopes = (scope: string | null | undefined): string[] =>
  (scope ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/** The stored token, when it is not about to expire. */
const usableStoredToken = (
  account: StoredPlanningCenterAccount,
  now: number
): PlanningCenterToken | null => {
  const expiresAt =
    account.accessTokenExpiresAt === null ||
    account.accessTokenExpiresAt === undefined
      ? Number.NaN
      : new Date(account.accessTokenExpiresAt).getTime();
  if (
    !isNonEmptyString(account.accessToken) ||
    !(expiresAt - now > EXPIRY_MARGIN_MS)
  ) {
    return null;
  }
  return {
    accessToken: account.accessToken,
    scopes: storedScopes(account.scope),
  };
};

const expired = () =>
  new Unauthenticated({
    message: "Planning Center connection expired. Please sign in again.",
  });

/** The stored token once another request has stored a fresh one, or null. */
const rereadStoredToken = async (
  account: StoredPlanningCenterAccount,
  tokenApi: TokenApi,
  delays: readonly number[] = REREAD_DELAYS_MS
): Promise<PlanningCenterToken | null> => {
  const [delay, ...later] = delays;
  if (delay === undefined) {
    return null;
  }
  await tokenApi.sleep(delay);
  const accounts = await tokenApi.findAccounts(account.userId);
  const reread = accounts.find((candidate) => candidate.id === account.id);
  const stored =
    reread === undefined ? null : usableStoredToken(reread, Date.now());
  return stored ?? (await rereadStoredToken(account, tokenApi, later));
};

/**
 * A usable Planning Center token for one linked account: the stored token while it is valid,
 * with no further database read; otherwise a refresh through Better Auth. A refused refresh
 * falls back to a token another request stored meanwhile before asking the user to sign in.
 */
export const getPlanningCenterToken = async (
  account: StoredPlanningCenterAccount,
  tokenApi: TokenApi,
  now: number = Date.now()
): Promise<PlanningCenterToken> => {
  const stored = usableStoredToken(account, now);
  if (stored !== null) {
    return stored;
  }
  try {
    const token = await tokenApi.refresh(account.userId, account.id);
    if (isNonEmptyString(token.accessToken)) {
      return { accessToken: token.accessToken, scopes: token.scopes };
    }
  } catch {
    // Handled below: another request may have refreshed first.
  }
  const reread = await rereadStoredToken(account, tokenApi);
  if (reread === null) {
    throw expired();
  }
  return reread;
};
