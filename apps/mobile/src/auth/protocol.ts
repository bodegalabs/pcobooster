import { Schema } from "effect";

export const nativeSessionSchema = Schema.Struct({
  token: Schema.String,
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.NullOr(Schema.String),
  }),
  selectedAccountId: Schema.NullOr(Schema.String),
});
export type NativeSession = typeof nativeSessionSchema.Type;
export const storedSessionSchema = Schema.Struct({
  activeUserId: Schema.NullOr(Schema.String),
  accounts: Schema.Array(nativeSessionSchema),
  demoToken: Schema.NullOr(Schema.String),
});
export type StoredSession = typeof storedSessionSchema.Type;
export const emptySession: StoredSession = {
  activeUserId: null,
  accounts: [],
  demoToken: null,
};

export const base64Url = (value: string): string =>
  value.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
export const callbackCode = (
  url: string,
  redirectUri: string,
  state: string
): string => {
  const callback = new URL(url);
  const expected = new URL(redirectUri);
  if (
    callback.protocol !== expected.protocol ||
    callback.hostname !== expected.hostname ||
    callback.pathname !== expected.pathname
  ) {
    throw new Error("That sign-in callback is invalid. Please start again.");
  }
  const actualState = callback.searchParams.get("state");
  const error = callback.searchParams.get("error");
  if (actualState !== state && !(error !== null && actualState === null)) {
    throw new Error("That sign-in link expired. Please start again.");
  }
  if (error !== null) {
    throw new Error(
      error === "access_denied"
        ? "Planning Center access wasn't granted. Try again when you're ready."
        : "Something went wrong signing in with Planning Center. Please try again."
    );
  }
  const code = callback.searchParams.get("code");
  if (code === null) {
    throw new Error("That sign-in callback is missing its code.");
  }
  return code;
};
export const activeCredentials = (session: StoredSession) => {
  const active = session.accounts.find(
    ({ user }) => user.id === session.activeUserId
  );
  return {
    token: session.demoToken === null ? (active?.token ?? null) : null,
    accountId:
      session.demoToken === null ? (active?.selectedAccountId ?? null) : null,
    demoToken: session.demoToken,
    userId: active?.user.id ?? null,
  };
};
export const nativeQueryScope = (
  session: StoredSession,
  origin: string
): string => {
  const credentials = activeCredentials(session);
  return JSON.stringify([
    origin,
    credentials.userId,
    credentials.accountId,
    credentials.demoToken === null ? "account" : "demo",
  ]);
};
export const shouldExpireSession = (
  sent: ReturnType<typeof activeCredentials>,
  current: ReturnType<typeof activeCredentials>
): boolean =>
  sent.token === current.token &&
  sent.accountId === current.accountId &&
  sent.demoToken === current.demoToken;

export const demoKeyFromLink = (value: string): string => {
  const input = value.trim();
  if (!input.includes("://")) {
    return input;
  }
  const url = new URL(input);
  if (
    url.protocol === "https:" &&
    url.hostname === "pcobooster.com" &&
    url.pathname.startsWith("/demo/")
  ) {
    return decodeURIComponent(url.pathname.slice(6));
  }
  if (
    (url.protocol === "pcobooster:" || url.protocol === "pcobooster-dev:") &&
    url.hostname === "demo"
  ) {
    return decodeURIComponent(url.pathname.slice(1));
  }
  throw new Error("Paste a pcobooster.com demo link or its key.");
};
