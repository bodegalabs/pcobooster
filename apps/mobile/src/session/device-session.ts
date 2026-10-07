/**
 * What this device remembers about who is signed in: several people (the web's device accounts),
 * one of them active, and an optional read-only demo. Pure values and changes; `SessionStore`
 * owns the current one and saves it in the Keychain.
 */
import { Schema } from "effect";

/** The most people one device remembers (`MAX_DEVICE_ACCOUNTS`). */
export const MAX_DEVICE_ACCOUNTS = 4;

export const DeviceAccountSchema = Schema.Struct({
  /** The Better Auth user id. */
  userId: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
  /** The signed session token for `Authorization: Bearer`. Never logged, never in AsyncStorage. */
  token: Schema.String,
  /** The Planning Center account row sent as `x-pcobooster-account`; null lets the server pick. */
  selectedAccountId: Schema.NullOr(Schema.String),
  organizationName: Schema.NullOr(Schema.String),
  lastUsedAt: Schema.Date,
  /** The server rejected the token (7 idle days, or revoked): sign in again. */
  needsSignIn: Schema.Boolean,
});
export type DeviceAccount = typeof DeviceAccountSchema.Type;

export const DemoCredentialSchema = Schema.Struct({
  /** The `pcobooster-demo` cookie value, sent as `x-pcobooster-demo`. */
  token: Schema.String,
  startedAt: Schema.Date,
});
export type DemoCredential = typeof DemoCredentialSchema.Type;

export const StoredSessionSchema = Schema.Struct({
  /** Most recently used first. */
  accounts: Schema.Array(DeviceAccountSchema),
  activeUserId: Schema.NullOr(Schema.String),
  demo: Schema.NullOr(DemoCredentialSchema),
});
export type StoredSession = typeof StoredSessionSchema.Type;

export const emptySession: StoredSession = {
  accounts: [],
  activeUserId: null,
  demo: null,
};

/** The JSON the Keychain item holds. */
export const StoredSessionJson = Schema.fromJsonString(
  Schema.toCodecJson(StoredSessionSchema)
);

export const activeAccount = (session: StoredSession): DeviceAccount | null =>
  session.accounts.find((account) => account.userId === session.activeUserId) ??
  null;

const byMostRecent = (left: DeviceAccount, right: DeviceAccount): number =>
  right.lastUsedAt.getTime() - left.lastUsedAt.getTime();

/**
 * Adds `account` or replaces the entry for the same person. Past `MAX_DEVICE_ACCOUNTS`, the least
 * recently used drop off; their tokens should be revoked.
 */
export const upsertAccount = (
  session: StoredSession,
  account: DeviceAccount
) => {
  const accounts = [
    ...session.accounts.filter(
      (candidate) => candidate.userId !== account.userId
    ),
    account,
  ].toSorted(byMostRecent);
  return {
    session: { ...session, accounts: accounts.slice(0, MAX_DEVICE_ACCOUNTS) },
    dropped: accounts.slice(MAX_DEVICE_ACCOUNTS),
  };
};

/** Forgets a person; the active one leaves nobody active. */
export const removeAccount = (session: StoredSession, userId: string) => {
  const removed =
    session.accounts.find((account) => account.userId === userId) ?? null;
  return {
    session: {
      ...session,
      accounts: session.accounts.filter((account) => account.userId !== userId),
      activeUserId:
        session.activeUserId === userId ? null : session.activeUserId,
    },
    removed,
  };
};

/** Changes one remembered person. */
export const updateAccount = (
  session: StoredSession,
  userId: string,
  change: (account: DeviceAccount) => DeviceAccount
): StoredSession => ({
  ...session,
  accounts: session.accounts.map((account) =>
    account.userId === userId ? change(account) : account
  ),
});

/** Makes a remembered person active and most recent, ending any demo. */
export const activateAccount = (
  session: StoredSession,
  userId: string,
  now: Date
): StoredSession => {
  if (!session.accounts.some((account) => account.userId === userId)) {
    return session;
  }
  const touched = updateAccount(session, userId, (account) => ({
    ...account,
    lastUsedAt: now,
  }));
  return {
    accounts: touched.accounts.toSorted(byMostRecent),
    activeUserId: userId,
    demo: null,
  };
};
