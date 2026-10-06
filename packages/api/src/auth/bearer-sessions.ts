/**
 * Bearer sessions for native clients: `Authorization: Bearer <signed session token>` stands in
 * for the session cookie on every Better Auth endpoint and every `auth.api.*` call, so the
 * product API's session lookup and `/api/auth/*` (get-session, sign-out) both accept it. The native app gets
 * its token from the sign-in exchange (`native-sign-in.ts`); browsers keep HttpOnly cookies.
 */
import type { BetterAuthPlugin } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";

/**
 * Better Auth's `bearer()` with only its request hook. Its response hook copies every new session
 * cookie into a `set-auth-token` response header (and exposes it to CORS), which page scripts can
 * read; that would undo what HttpOnly protects for web sessions. `requireSignature` accepts only
 * the `token.signature` form, which needs the server secret: raw session tokens also appear in D1
 * and in some JSON responses, and must not work as credentials on their own.
 */
export const bearerSessions = () => {
  const { id, version, hooks, options } = bearer({ requireSignature: true });
  return {
    id,
    version,
    hooks: { before: hooks.before },
    options,
  } satisfies BetterAuthPlugin;
};
