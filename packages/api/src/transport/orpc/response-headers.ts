import { PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE } from "@worship-admin/api/auth/planning-center-session";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

export const applyPrivateNoStore = (headers: Headers | undefined): void => {
  headers?.set("Cache-Control", "private, no-store");
};

export const serializeSelectedPlanningCenterAccountCookie = (
  accountId: string,
  production = process.env.NODE_ENV === "production"
): string => {
  const attributes = [
    `${PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE}=${encodeURIComponent(accountId)}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${THIRTY_DAYS_IN_SECONDS}`,
    "Path=/",
  ];
  if (production) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
};

export const appendSelectedPlanningCenterAccountCookie = (
  headers: Headers | undefined,
  accountId: string
): void => {
  headers?.append(
    "Set-Cookie",
    serializeSelectedPlanningCenterAccountCookie(accountId)
  );
};
