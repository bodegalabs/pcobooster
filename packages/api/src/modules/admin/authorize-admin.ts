import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import { auth } from "@pcobooster/api/auth";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@pcobooster/api/auth/dev-bypass";
import { isAdminEmail } from "@pcobooster/api/modules/admin/get-account-activity";

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
