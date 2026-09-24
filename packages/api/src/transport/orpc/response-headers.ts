import { PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE } from "@pcobooster/api/auth/planning-center-session";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";
import { DEMO_SESSION_COOKIE } from "@pcobooster/contracts/demo";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

export const applyPrivateNoStore = (headers: Headers | undefined): void => {
  headers?.set("Cache-Control", "private, no-store");
};

const serializeSessionCookie = (
  name: string,
  value: string | null,
  secure: boolean
): string => {
  const attributes = [
    `${name}=${encodeURIComponent(value ?? "")}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${value === null ? 0 : THIRTY_DAYS_IN_SECONDS}`,
    "Path=/",
  ];
  if (secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
};

export const serializeSelectedPlanningCenterAccountCookie = (
  accountId: string,
  secure: boolean
): string =>
  serializeSessionCookie(
    PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE,
    accountId,
    secure
  );

/** A null token expires the demo session cookie. */
export const serializeDemoSessionCookie = (
  sessionToken: string | null,
  secure: boolean
): string => serializeSessionCookie(DEMO_SESSION_COOKIE, sessionToken, secure);

/** Cookies are `Secure` everywhere except plain-HTTP local development. */
const isSecure = (context: RpcContext): boolean =>
  !context.server.config.localDevelopment;

export const appendSelectedPlanningCenterAccountCookie = (
  context: RpcContext,
  accountId: string
): void => {
  context.resHeaders?.append(
    "Set-Cookie",
    serializeSelectedPlanningCenterAccountCookie(accountId, isSecure(context))
  );
};

export const appendDemoSessionCookie = (
  context: RpcContext,
  sessionToken: string | null
): void => {
  context.resHeaders?.append(
    "Set-Cookie",
    serializeDemoSessionCookie(sessionToken, isSecure(context))
  );
};
