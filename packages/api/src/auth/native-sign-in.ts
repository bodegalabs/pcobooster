/**
 * Sign-in for the native iOS app, on top of the web's Planning Center OAuth flow.
 *
 * 1. The app opens `GET /api/auth/native/start` in an ASWebAuthenticationSession with a PKCE S256
 *    challenge, its own opaque `state`, and one of `NATIVE_REDIRECT_URIS`. Start begins the usual
 *    Planning Center flow in that browser and sets a signed marker cookie bound to the flow's
 *    OAuth state.
 * 2. When that flow's callback creates a session, the callback hook stores a single-use handoff
 *    code (hashed, two minutes, bound to the challenge) and redirects to the app's URI with the
 *    code and state instead of the web page. A failed callback redirects there with a stable
 *    `error` code. The callback response sets no session cookies in the browser.
 * 3. The app trades the code and its PKCE verifier at `POST /api/auth/native/exchange` for a
 *    signed session token, which it sends as `Authorization: Bearer` (`bearer-sessions.ts`).
 *
 * Only the handoff code crosses the custom scheme; the session token travels only in the
 * exchange's response body. A callback without a marker for its own flow (every web sign-in)
 * is left untouched. See docs/native-auth.md.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { DEVICE_COOKIE_MARKER } from "@pcobooster/api/auth/device-accounts";
import { PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE } from "@pcobooster/api/auth/planning-center-session";
import { parseSignInFailure } from "@pcobooster/api/auth/sign-in-failure";
import type {
  SignInFailure,
  SignInFailureCode,
} from "@pcobooster/api/auth/sign-in-failure";
import { logger } from "@pcobooster/api/logger";
import {
  APIError,
  HIDE_METADATA,
  generateGenericState,
  generateIdTokenNonce,
} from "better-auth";
import type {
  BetterAuthCookies,
  BetterAuthPlugin,
  GenericEndpointContext,
} from "better-auth";
import { createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { expireCookie, parseSetCookieHeader } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import { z } from "zod";

/** The only places a native sign-in returns to, compared exactly. Never read from elsewhere. */
export const NATIVE_REDIRECT_URIS = [
  "pcobooster://auth/callback",
  "pcobooster-dev://auth/callback",
] as const;
export type NativeRedirectUri = (typeof NATIVE_REDIRECT_URIS)[number];

/** Better Auth endpoint paths, served under `/api/auth`. */
export const NATIVE_SIGN_IN_START_PATH = "/native/start";
export const NATIVE_SIGN_IN_EXCHANGE_PATH = "/native/exchange";

/**
 * The `error` a native sign-in can redirect to the app with. The app keys its copy on these, so
 * Better Auth's own codes are folded into this fixed list rather than passed through.
 */
export const nativeSignInErrorCodes = [
  /** Start was missing or had a malformed `code_challenge`, `code_challenge_method`, or `state`. */
  "invalid_request",
  /** The person declined or cancelled at Planning Center. */
  "access_denied",
  /** The browser flow expired or lost its cookies before the callback. Start again. */
  "sign_in_expired",
  /** The Planning Center profile has no email address. */
  "email_not_found",
  /** Planning Center's profile could not be read. */
  "profile_unavailable",
  /** This organization could not be added to the account. */
  "account_not_linked",
  /** This Planning Center login already belongs to a different pcobooster.com account. */
  "account_linked_elsewhere",
  /** Anything else, including codes this list does not know yet. */
  "server_error",
] as const;
export type NativeSignInErrorCode = (typeof nativeSignInErrorCodes)[number];

/** JSON error `code`s from start and exchange (Better Auth's error body: `{ code, message }`). */
export const nativeSignInApiErrorCodes = [
  "INVALID_REDIRECT_URI",
  "INVALID_REQUEST",
  "INVALID_GRANT",
] as const;
export type NativeSignInApiErrorCode =
  (typeof nativeSignInApiErrorCodes)[number];

/** How long a handoff code can be exchanged. */
export const NATIVE_HANDOFF_TTL_SECONDS = 120;
const MILLISECONDS_PER_SECOND = 1000;
/**
 * Better Auth keeps an OAuth state for ten minutes; the marker lasts as long, so a slow sign-in
 * still reports its outcome to the app.
 */
const MARKER_MAX_AGE_SECONDS = 600;
const MARKER_COOKIE = "native_sign_in";
const HANDOFF_IDENTIFIER_PREFIX = "native-sign-in:";
/** 256 bits: 43 base64url characters. */
const HANDOFF_CODE_BYTES = 32;
/** The verifier Better Auth sends Planning Center, unrelated to the app's own PKCE pair. */
const PROVIDER_CODE_VERIFIER_BYTES = 64;
const PLANNING_CENTER_PROVIDER_ID = "planning-center";
/** Where a callback would land if this plugin's hook never ran: the web's own defaults. */
const WEB_CALLBACK_PATH = "/services";
const WEB_ERROR_PATH = "/auth";

/** base64url(SHA-256(verifier)) without padding (RFC 7636 S256). */
const S256_CHALLENGE = /^[\w-]{43}$/u;
/** RFC 7636 code verifier: 43 to 128 unreserved characters. */
const CODE_VERIFIER = /^[\w.~-]{43,128}$/u;
/** Opaque to the server, echoed into a URL, and long enough to be unguessable. */
const APP_STATE = /^[\w.~-]{16,256}$/u;
const HANDOFF_CODE = /^[\w-]{43}$/u;

const startQuerySchema = z.object({
  code_challenge: z.string().regex(S256_CHALLENGE),
  code_challenge_method: z.literal("S256"),
  state: z.string().regex(APP_STATE),
});

const markerSchema = z.object({
  redirectUri: z.enum(NATIVE_REDIRECT_URIS),
  challenge: z.string().regex(S256_CHALLENGE),
  appState: z.string().regex(APP_STATE),
  oauthState: z.string().min(1),
});
type NativeSignInMarker = z.infer<typeof markerSchema>;

const handoffSchema = z.object({
  sessionToken: z.string().min(1),
  userId: z.string().min(1),
  selectedAccountId: z.string().min(1).nullable(),
  challenge: z.string().regex(S256_CHALLENGE),
});
type NativeSignInHandoff = z.infer<typeof handoffSchema>;

const exchangeBodySchema = z.object({
  code: z.string().regex(HANDOFF_CODE),
  codeVerifier: z.string().regex(CODE_VERIFIER),
});

const callbackQuerySchema = z.object({ state: z.string() });

/** The exchange's response body. */
export interface NativeSignInExchangeResult {
  /** `<session token>.<signature>`, sent back as `Authorization: Bearer <token>`. */
  readonly token: string;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly image: string | null;
  };
  /** The organization (account row) the sign-in selected; send it as `x-pcobooster-account`. */
  readonly selectedAccountId: string | null;
}

const nativeSignInLog = logger.for("auth/native-sign-in");

const NATIVE_ERROR_BY_FAILURE: ReadonlyMap<
  SignInFailureCode,
  NativeSignInErrorCode
> = new Map([
  ["access_denied", "access_denied"],
  ["state_mismatch", "sign_in_expired"],
  ["state_not_found", "sign_in_expired"],
  ["please_restart_the_process", "sign_in_expired"],
  ["email_not_found", "email_not_found"],
  ["unable_to_get_user_info", "profile_unavailable"],
  ["account_not_linked", "account_not_linked"],
  ["unable_to_link_account", "account_not_linked"],
  ["account_already_linked_to_different_user", "account_linked_elsewhere"],
]);

const nativeErrorFor = (
  failure: SignInFailure | null
): NativeSignInErrorCode =>
  failure === null || failure.code === "unknown"
    ? "server_error"
    : (NATIVE_ERROR_BY_FAILURE.get(failure.code) ?? "server_error");

const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/** Stored under a hash, so a database read never yields a usable code. */
const handoffIdentifier = (code: string): string =>
  `${HANDOFF_IDENTIFIER_PREFIX}${sha256(code).toString("base64url")}`;

/** Digests have a fixed length, so comparison time reveals nothing about the challenge. */
const verifierMatchesChallenge = (
  verifier: string,
  challenge: string
): boolean =>
  timingSafeEqual(
    sha256(sha256(verifier).toString("base64url")),
    sha256(challenge)
  );

const parseRedirectUri = (
  value: string | undefined
): NativeRedirectUri | null =>
  NATIVE_REDIRECT_URIS.find((uri) => uri === value) ?? null;

const appRedirect = (
  redirectUri: NativeRedirectUri,
  parameters: Readonly<Record<string, string>>
): string => `${redirectUri}?${new URLSearchParams(parameters).toString()}`;

/** Parses stored JSON text with a schema; anything malformed or unexpected is `null`. */
const parseStored = <Schema extends z.ZodType>(
  schema: Schema,
  stored: string
): z.infer<Schema> | null => {
  try {
    const parsed = schema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** Scoped to Better Auth's routes: only the provider callback reads it. */
const markerCookie = (ctx: GenericEndpointContext) =>
  ctx.context.createAuthCookie(MARKER_COOKIE, {
    path: new URL(ctx.context.baseURL).pathname,
    maxAge: MARKER_MAX_AGE_SECONDS,
  });

const signedCookieValueSchema = z.string().min(1);

const readMarker = async (
  ctx: GenericEndpointContext
): Promise<NativeSignInMarker | null> => {
  // A missing, tampered, or unsigned cookie verifies to null (or false).
  const value = signedCookieValueSchema.safeParse(
    await ctx.getSignedCookie(markerCookie(ctx).name, ctx.context.secret)
  );
  return value.success ? parseStored(markerSchema, value.data) : null;
};

const setCookieName = (entry: string): string =>
  entry.slice(0, Math.max(entry.indexOf("="), 0)).trim();

/** The organization the callback selected (`selectSignedInAccount` in `auth.ts`). */
const selectedAccountIdFrom = (headers: Headers | undefined): string | null => {
  let selected: string | null = null;
  for (const entry of headers?.getSetCookie() ?? []) {
    const value = parseSetCookieHeader(entry).get(
      PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE
    )?.value;
    if (value !== undefined && value !== "") {
      try {
        selected = decodeURIComponent(value);
      } catch {
        selected = value;
      }
    }
  }
  return selected;
};

/**
 * Removes the cookies a web callback sets for its new session (session token, session cache,
 * device account, selected organization). The session belongs to the app, so it must not land
 * in the browser, and a shared browser keeps whatever web session it already had.
 */
const dropBrowserSessionCookies = (
  headers: Headers | undefined,
  { sessionToken, sessionData, dontRememberToken }: BetterAuthCookies
): void => {
  if (headers === undefined) {
    return;
  }
  const isSessionCookie = (name: string): boolean =>
    name === sessionToken.name ||
    name.startsWith(`${sessionToken.name}${DEVICE_COOKIE_MARKER}`) ||
    name === sessionData.name ||
    name.startsWith(`${sessionData.name}.`) ||
    name === dontRememberToken.name ||
    name === PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE;
  const entries = headers.getSetCookie();
  const kept = entries.filter(
    (entry) => !isSessionCookie(setCookieName(entry))
  );
  if (kept.length === entries.length) {
    return;
  }
  headers.delete("set-cookie");
  for (const entry of kept) {
    headers.append("set-cookie", entry);
  }
};

/** Stores the handoff; null when it could not be stored. */
const issueHandoffCode = async (
  ctx: GenericEndpointContext,
  handoff: NativeSignInHandoff
): Promise<string | null> => {
  const code = randomBytes(HANDOFF_CODE_BYTES).toString("base64url");
  try {
    await ctx.context.internalAdapter.createVerificationValue({
      identifier: handoffIdentifier(code),
      value: JSON.stringify(handoff),
      expiresAt: new Date(
        Date.now() + NATIVE_HANDOFF_TTL_SECONDS * MILLISECONDS_PER_SECOND
      ),
    });
    return code;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    nativeSignInLog.error(
      { err, userId: handoff.userId },
      "Failed to store native sign-in handoff"
    );
    return null;
  }
};

/** A session made only for a handoff that cannot complete; nobody else holds its token. */
const discardSession = async (
  ctx: GenericEndpointContext,
  sessionToken: string
): Promise<void> => {
  try {
    await ctx.context.internalAdapter.deleteSession(sessionToken);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    nativeSignInLog.warn({ err }, "Failed to discard native sign-in session");
  }
};

const apiError = (code: NativeSignInApiErrorCode, message: string): APIError =>
  APIError.from("BAD_REQUEST", { code, message });

export const nativeSignIn = () =>
  ({
    id: "native-sign-in",
    endpoints: {
      nativeSignInStart: createAuthEndpoint(
        NATIVE_SIGN_IN_START_PATH,
        {
          method: "GET",
          // Read loosely so a bad parameter can still be reported to a valid redirect URI.
          query: z.object({
            code_challenge: z.string().optional(),
            code_challenge_method: z.string().optional(),
            state: z.string().optional(),
            redirect_uri: z.string().optional(),
          }),
          metadata: HIDE_METADATA,
        },
        async (ctx) => {
          const redirectUri = parseRedirectUri(ctx.query.redirect_uri);
          if (redirectUri === null) {
            // Never redirect to a URI outside the allowlist; answer in the browser instead.
            throw apiError(
              "INVALID_REDIRECT_URI",
              "redirect_uri must be a registered native app callback."
            );
          }
          const echoedState = APP_STATE.test(ctx.query.state ?? "")
            ? ctx.query.state
            : undefined;
          const failure = (error: NativeSignInErrorCode) =>
            ctx.redirect(
              appRedirect(
                redirectUri,
                echoedState === undefined
                  ? { error }
                  : { error, state: echoedState }
              )
            );
          const parameters = startQuerySchema.safeParse(ctx.query);
          if (!parameters.success) {
            throw failure("invalid_request");
          }
          const provider = ctx.context.socialProviders.find(
            (candidate) => candidate.id === PLANNING_CENTER_PROVIDER_ID
          );
          if (provider === undefined) {
            nativeSignInLog.error("Planning Center provider is not registered");
            throw failure("server_error");
          }
          let authorizationUrl: URL;
          try {
            const codeVerifier = randomBytes(
              PROVIDER_CODE_VERIFIER_BYTES
            ).toString("base64url");
            const idTokenNonce = generateIdTokenNonce(provider);
            const { state } = await generateGenericState(ctx, {
              callbackURL: WEB_CALLBACK_PATH,
              errorURL: WEB_ERROR_PATH,
              codeVerifier,
              idTokenNonce,
              expiresAt:
                Date.now() + MARKER_MAX_AGE_SECONDS * MILLISECONDS_PER_SECOND,
            });
            const marker: NativeSignInMarker = {
              redirectUri,
              challenge: parameters.data.code_challenge,
              appState: parameters.data.state,
              oauthState: state,
            };
            const cookie = markerCookie(ctx);
            await ctx.setSignedCookie(
              cookie.name,
              JSON.stringify(marker),
              ctx.context.secret,
              cookie.attributes
            );
            authorizationUrl = await provider.createAuthorizationURL({
              state,
              codeVerifier,
              idTokenNonce,
              redirectURI: `${ctx.context.baseURL}${provider.callbackPath ?? `/callback/${provider.id}`}`,
            });
          } catch (error) {
            const err =
              error instanceof Error ? error : new Error(String(error));
            nativeSignInLog.error({ err }, "Native sign-in failed to start");
            throw failure("server_error");
          }
          throw ctx.redirect(authorizationUrl.toString());
        }
      ),
      nativeSignInExchange: createAuthEndpoint(
        NATIVE_SIGN_IN_EXCHANGE_PATH,
        {
          method: "POST",
          // Validated below, so every malformed body gets the same error code.
          body: z.unknown(),
          metadata: HIDE_METADATA,
        },
        async (ctx) => {
          ctx.setHeader("cache-control", "no-store");
          const body = exchangeBodySchema.safeParse(ctx.body);
          if (!body.success) {
            throw apiError(
              "INVALID_REQUEST",
              "Send a JSON body with code and codeVerifier."
            );
          }
          const rejected = (reason: string): APIError => {
            nativeSignInLog.warn(
              { reason },
              "Native sign-in exchange rejected"
            );
            return apiError(
              "INVALID_GRANT",
              "That sign-in code is invalid or expired. Please sign in again."
            );
          };
          // Single use: consuming deletes the code, including when the verifier is wrong.
          const stored =
            await ctx.context.internalAdapter.consumeVerificationValue(
              handoffIdentifier(body.data.code)
            );
          if (stored === null) {
            throw rejected("unknown_or_expired_code");
          }
          const handoff = parseStored(handoffSchema, stored.value);
          if (handoff === null) {
            throw rejected("malformed_handoff");
          }
          if (
            !verifierMatchesChallenge(body.data.codeVerifier, handoff.challenge)
          ) {
            await discardSession(ctx, handoff.sessionToken);
            throw rejected("verifier_mismatch");
          }
          const found = await ctx.context.internalAdapter.findSession(
            handoff.sessionToken
          );
          if (
            found === null ||
            found.user.id !== handoff.userId ||
            found.session.expiresAt.getTime() <= Date.now()
          ) {
            throw rejected("session_ended");
          }
          const { session, user } = found;
          nativeSignInLog.info(
            { userId: user.id },
            "Native sign-in code exchanged"
          );
          const result: NativeSignInExchangeResult = {
            token: `${session.token}.${await makeSignature(session.token, ctx.context.secret)}`,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image ?? null,
            },
            selectedAccountId: handoff.selectedAccountId,
          };
          return await ctx.json(result);
        }
      ),
    },
    hooks: {
      after: [
        {
          matcher: (context) => context.path === "/callback/:id",
          handler: createAuthMiddleware(async (ctx) => {
            // A POST callback only redirects to the GET callback, which this hook handles.
            if (ctx.method !== "GET") {
              return;
            }
            const marker = await readMarker(ctx);
            const callback = callbackQuerySchema.safeParse(ctx.query);
            // No marker for this flow: a web sign-in, or a native start abandoned in this browser.
            if (
              marker === null ||
              !callback.success ||
              callback.data.state !== marker.oauthState
            ) {
              return;
            }
            expireCookie(ctx, markerCookie(ctx));
            const { responseHeaders } = ctx.context;
            const selectedAccountId = selectedAccountIdFrom(responseHeaders);
            dropBrowserSessionCookies(responseHeaders, ctx.context.authCookies);
            const fail = (error: NativeSignInErrorCode): void => {
              ctx.setHeader(
                "location",
                appRedirect(marker.redirectUri, {
                  error,
                  state: marker.appState,
                })
              );
            };
            const created = ctx.context.newSession;
            if (created === null) {
              fail(
                nativeErrorFor(
                  parseSignInFailure(responseHeaders?.get("location"))
                )
              );
              return;
            }
            const code = await issueHandoffCode(ctx, {
              sessionToken: created.session.token,
              userId: created.user.id,
              selectedAccountId,
              challenge: marker.challenge,
            });
            if (code === null) {
              await discardSession(ctx, created.session.token);
              fail("server_error");
              return;
            }
            nativeSignInLog.info(
              { userId: created.user.id },
              "Native sign-in code issued"
            );
            ctx.setHeader(
              "location",
              appRedirect(marker.redirectUri, { code, state: marker.appState })
            );
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
