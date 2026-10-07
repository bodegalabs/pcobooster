/**
 * Native sign-in (docs/native-auth.md): PKCE S256 and a random `state` through
 * `/api/auth/native/start`, Planning Center in an ephemeral web authentication session, an exact
 * callback check, and a one-use exchange at `/api/auth/native/exchange` for the bearer token.
 * Every request here is cookieless.
 */
import { formatClientHeader } from "@pcobooster/contracts/http/client-version";
import { Data, Option, Schema } from "effect";

import { makePkce, PKCE_METHOD, randomUrlSafe } from "./pkce";
import type { SignInCrypto } from "./pkce";

export const NATIVE_START_PATH = "/api/auth/native/start";
export const NATIVE_EXCHANGE_PATH = "/api/auth/native/exchange";
export const SIGN_OUT_PATH = "/api/auth/sign-out";

/** The two redirect URIs the server allows (`NATIVE_REDIRECT_URIS`), compared as exact strings. */
export const RELEASE_REDIRECT_URI = "pcobooster://auth/callback";
export const DEVELOPMENT_REDIRECT_URI = "pcobooster-dev://auth/callback";

/** One sign-in attempt. Kept in memory for the attempt's lifetime only. */
export interface SignInAttempt {
  readonly startUrl: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly verifier: string;
}

/** The exchange's answer. `token` is the signed session token; never log it. */
export const NativeSignInResultSchema = Schema.Struct({
  token: Schema.String.check(Schema.isNonEmpty()),
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  selectedAccountId: Schema.NullOr(Schema.String),
});
export type NativeSignInResult = typeof NativeSignInResultSchema.Type;

/** `error` codes on the app redirect (`nativeSignInErrorCodes`); others read as `server_error`. */
interface CallbackMessages {
  readonly [code: string]: string;
}
const callbackMessages: CallbackMessages = {
  access_denied:
    "Planning Center access wasn't granted. Try again when you're ready.",
  sign_in_expired: "That sign-in link expired. Please start again.",
  email_not_found:
    "Your Planning Center profile needs an email address to sign in.",
  profile_unavailable:
    "We couldn't read your Planning Center profile. Please try again.",
  account_not_linked:
    "We couldn't add this Planning Center organization to your account. Please try again.",
  account_linked_elsewhere:
    "This Planning Center login is already connected to a different pcobooster.com account.",
};

const GENERIC_MESSAGE =
  "Something went wrong signing in with Planning Center. Please try again.";
const EXPIRED_MESSAGE = "That sign-in link expired. Please start again.";

export type SignInFailureReason =
  /** The person closed the sheet. Not shown. */
  | "cancelled"
  /** The server redirected back with an `error` code (`code`). */
  | "callback"
  /** The callback's `state` is not this attempt's. */
  | "stateMismatch"
  /** The callback is not `<redirect_uri>?code&state` (or `?error&state`). */
  | "malformedCallback"
  /** The attempt already finished; a code is exchanged at most once. */
  | "attemptUsed"
  /** `INVALID_GRANT`: unknown, used, or expired code, or the verifier did not match. */
  | "invalidGrant"
  | "rateLimited"
  /** Another server answer. */
  | "server"
  /** The request never reached the server, or its answer was unreadable. */
  | "network";

export class SignInFailure extends Data.TaggedError("SignInFailure")<{
  readonly reason: SignInFailureReason;
  /** The callback's `error` code, or the server's `code`. */
  readonly code?: string;
}> {
  /** What the sign-in screen says (the web's sign-in error copy). */
  override get message(): string {
    switch (this.reason) {
      case "cancelled": {
        return "Sign-in was cancelled.";
      }
      case "callback": {
        return callbackMessages[this.code ?? ""] ?? GENERIC_MESSAGE;
      }
      case "stateMismatch":
      case "attemptUsed":
      case "invalidGrant": {
        return EXPIRED_MESSAGE;
      }
      case "rateLimited": {
        return "Too many sign-in attempts. Wait a minute, then try again.";
      }
      case "network": {
        return "Couldn't reach pcobooster.com. Check your connection and try again.";
      }
      case "malformedCallback":
      case "server": {
        return GENERIC_MESSAGE;
      }
      default: {
        throw new Error("Unknown sign-in failure");
      }
    }
  }
}

/** The code the server mints: 43 base64url characters. */
const CALLBACK_CODE = /^[A-Za-z0-9_-]{43}$/u;

/** A query string's pairs; null when a name repeats or a part does not decode. */
const parseQuery = (query: string): Map<string, string> | null => {
  const pairs = new Map<string, string>();
  for (const part of query.split("&")) {
    if (part === "") {
      continue;
    }
    const separator = part.indexOf("=");
    const rawName = separator === -1 ? part : part.slice(0, separator);
    const rawValue = separator === -1 ? "" : part.slice(separator + 1);
    try {
      const name = decodeURIComponent(rawName.replaceAll("+", " "));
      if (pairs.has(name)) {
        return null;
      }
      pairs.set(name, decodeURIComponent(rawValue.replaceAll("+", " ")));
    } catch {
      return null;
    }
  }
  return pairs;
};

/**
 * The code a callback URL carries for `attempt`, or the failure it reports. The URL must be the
 * attempt's redirect URI exactly, followed by a query and nothing else; a repeated parameter, a
 * fragment, or another path, host, or scheme is malformed. The server echoes `state` on every
 * redirect, leaving it off only when the state it received was itself invalid.
 */
export const readCallback = (url: string, attempt: SignInAttempt): string => {
  const prefix = `${attempt.redirectUri}?`;
  if (!url.startsWith(prefix) || url.includes("#")) {
    throw new SignInFailure({ reason: "malformedCallback" });
  }
  const query = parseQuery(url.slice(prefix.length));
  if (
    query === null ||
    [...query.keys()].some(
      (name) => !["code", "state", "error"].includes(name)
    ) ||
    (query.has("error") && query.has("code"))
  ) {
    throw new SignInFailure({ reason: "malformedCallback" });
  }
  const state = query.get("state");
  const error = query.get("error");
  if (error !== undefined) {
    if (state !== undefined && state !== attempt.state) {
      throw new SignInFailure({ reason: "stateMismatch" });
    }
    throw new SignInFailure({ reason: "callback", code: error });
  }
  if (state !== attempt.state) {
    throw new SignInFailure({ reason: "stateMismatch" });
  }
  const code = query.get("code");
  if (code === undefined || !CALLBACK_CODE.test(code)) {
    throw new SignInFailure({ reason: "malformedCallback" });
  }
  return code;
};

/**
 * Opens the start URL in an ephemeral web authentication session and resolves with the callback
 * URL, or null when the person closed it.
 */
export type WebAuthentication = (
  startUrl: string,
  redirectUri: string
) => Promise<string | null>;

export interface NativeSignInDependencies {
  /** The product origin, `https://pcobooster.com` in Release. */
  readonly origin: string;
  readonly redirectUri: string;
  readonly crypto: SignInCrypto;
  readonly authenticate: WebAuthentication;
  readonly fetch: typeof globalThis.fetch;
}

const decodeResult = Schema.decodeUnknownSync(NativeSignInResultSchema);
const ErrorBodySchema = Schema.Struct({ code: Schema.optional(Schema.String) });
const decodeErrorBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(ErrorBodySchema)
);

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_UNAUTHORIZED = 401;

/** Headers for the auth endpoints: JSON, the client header, and never a cookie. */
const jsonHeaders = (extra: Record<string, string> = {}) => ({
  accept: "application/json",
  "content-type": "application/json",
  "x-pcobooster-client": formatClientHeader("expo"),
  ...extra,
});

export interface NativeSignIn {
  readonly makeAttempt: () => Promise<SignInAttempt>;
  /** Checks the callback, then exchanges its code once. A second call for one attempt fails. */
  readonly complete: (
    attempt: SignInAttempt,
    callbackUrl: string
  ) => Promise<NativeSignInResult>;
  /** The whole flow: attempt, web session, callback check, exchange. */
  readonly signIn: () => Promise<NativeSignInResult>;
  /** Revokes a session; one that is already gone counts as signed out. */
  readonly revoke: (token: string) => Promise<void>;
}

export const makeNativeSignIn = ({
  origin,
  redirectUri,
  crypto,
  authenticate,
  fetch,
}: NativeSignInDependencies): NativeSignIn => {
  const finished = new WeakSet<SignInAttempt>();

  const send = async (path: string, init: RequestInit): Promise<Response> => {
    try {
      return await fetch(`${origin}${path}`, {
        ...init,
        method: "POST",
        credentials: "omit",
      });
    } catch {
      throw new SignInFailure({ reason: "network" });
    }
  };

  const exchange = async (
    code: string,
    verifier: string
  ): Promise<NativeSignInResult> => {
    const response = await send(NATIVE_EXCHANGE_PATH, {
      headers: jsonHeaders(),
      body: JSON.stringify({ code, codeVerifier: verifier }),
    });
    const body = await response.text().catch(() => "");
    if (response.ok) {
      try {
        return decodeResult(JSON.parse(body));
      } catch {
        throw new SignInFailure({ reason: "network" });
      }
    }
    if (response.status === HTTP_TOO_MANY_REQUESTS) {
      throw new SignInFailure({ reason: "rateLimited" });
    }
    const errorCode = Option.getOrUndefined(decodeErrorBody(body))?.code;
    if (errorCode === "INVALID_GRANT") {
      throw new SignInFailure({ reason: "invalidGrant", code: errorCode });
    }
    throw new SignInFailure({
      reason: "server",
      code: errorCode ?? String(response.status),
    });
  };

  const makeAttempt = async (): Promise<SignInAttempt> => {
    const pkce = await makePkce(crypto);
    const state = randomUrlSafe(crypto);
    const query = [
      ["redirect_uri", redirectUri],
      ["code_challenge", pkce.challenge],
      ["code_challenge_method", PKCE_METHOD],
      ["state", state],
    ]
      .map(
        ([name, value]) =>
          `${name}=${encodeURIComponent(value ?? "").replaceAll("%20", "+")}`
      )
      .join("&");
    return {
      startUrl: `${origin}${NATIVE_START_PATH}?${query}`,
      redirectUri,
      state,
      verifier: pkce.verifier,
    };
  };

  const complete = async (
    attempt: SignInAttempt,
    callbackUrl: string
  ): Promise<NativeSignInResult> => {
    if (finished.has(attempt)) {
      throw new SignInFailure({ reason: "attemptUsed" });
    }
    finished.add(attempt);
    const code = readCallback(callbackUrl, attempt);
    return await exchange(code, attempt.verifier);
  };

  return {
    makeAttempt,
    complete,
    signIn: async () => {
      const attempt = await makeAttempt();
      const callbackUrl = await authenticate(
        attempt.startUrl,
        attempt.redirectUri
      );
      if (callbackUrl === null) {
        throw new SignInFailure({ reason: "cancelled" });
      }
      return await complete(attempt, callbackUrl);
    },
    revoke: async (token) => {
      const response = await send(SIGN_OUT_PATH, {
        headers: jsonHeaders({ authorization: `Bearer ${token}` }),
        body: "{}",
      });
      if (!response.ok && response.status !== HTTP_UNAUTHORIZED) {
        throw new SignInFailure({
          reason: "server",
          code: String(response.status),
        });
      }
    },
  };
};
