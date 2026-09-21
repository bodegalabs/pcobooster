import { auth } from "@worship-admin/api/auth";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@worship-admin/api/auth/dev-bypass";
import { ApiError } from "@worship-admin/api/http/api-error";
import { isAdminEmail } from "@worship-admin/api/use-cases/admin/get-account-activity";

export const authorizeAdminRequest = async (request: Request) => {
  const session = isDevAuthBypassEnabled()
    ? getDevBypassSession(await loadDevBypassIdentity())
    : await auth.api.getSession({ headers: request.headers });

  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
  }
  if (!isAdminEmail(session.user.email)) {
    throw new ApiError(403, "FORBIDDEN", "Admin access required");
  }

  return session;
};
