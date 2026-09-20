import { Forbidden } from "@worship-admin/api/application/errors/forbidden";
import { Unauthenticated } from "@worship-admin/api/application/errors/unauthenticated";
import { auth } from "@worship-admin/api/auth";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@worship-admin/api/auth/dev-bypass";
import { isAdminEmail } from "@worship-admin/api/modules/admin/get-account-activity";

export const authorizeAdminRequest = async (request: Request) => {
  const session = isDevAuthBypassEnabled()
    ? getDevBypassSession(await loadDevBypassIdentity())
    : await auth.api.getSession({ headers: request.headers });

  if (!session) {
    throw new Unauthenticated({ message: "Sign in required" });
  }
  if (!isAdminEmail(session.user.email)) {
    throw new Forbidden({ message: "Admin access required" });
  }

  return session;
};
