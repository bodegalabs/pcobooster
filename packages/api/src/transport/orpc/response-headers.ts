import { PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE } from "@pcobooster/api/auth/planning-center-session";
import { DEMO_SESSION_COOKIE } from "@pcobooster/contracts/demo";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

export const applyPrivateNoStore = (headers: Headers | undefined): void => {
  headers?.set("Cache-Control", "private, no-store");
};

const serializeSessionCookie = (
  name: string,
  value: string | null,
  production: boolean
): string => {
  const attributes = [
    `${name}=${encodeURIComponent(value ?? "")}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${value === null ? 0 : THIRTY_DAYS_IN_SECONDS}`,
    "Path=/",
  ];
  if (production) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
};

export const serializeSelectedPlanningCenterAccountCookie = (
  accountId: string,
  production = process.env.NODE_ENV === "production"
): string =>
  serializeSessionCookie(
    PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE,
    accountId,
    production
  );

/** A null token expires the demo session cookie. */
export const serializeDemoSessionCookie = (
  sessionToken: string | null,
  production = process.env.NODE_ENV === "production"
): string =>
  serializeSessionCookie(DEMO_SESSION_COOKIE, sessionToken, production);

export const appendSelectedPlanningCenterAccountCookie = (
  headers: Headers | undefined,
  accountId: string
): void => {
  headers?.append(
    "Set-Cookie",
    serializeSelectedPlanningCenterAccountCookie(accountId)
  );
};

export const appendDemoSessionCookie = (
  headers: Headers | undefined,
  sessionToken: string | null
): void => {
  headers?.append("Set-Cookie", serializeDemoSessionCookie(sessionToken));
};
