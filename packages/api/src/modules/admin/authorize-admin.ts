import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import {
  getDevBypassSession,
  loadDevBypassIdentity,
} from "@pcobooster/api/auth/dev-bypass";
import { isAdminEmail } from "@pcobooster/api/modules/admin/get-account-activity";
import type { ServerDependencies } from "@pcobooster/api/server";

export const authorizeAdminRequest = async (
  { auth, config }: Pick<ServerDependencies, "auth" | "config">,
  request: Request
) => {
  const session = config.devAuthBypass
    ? getDevBypassSession(
        await loadDevBypassIdentity(config.localPlanningCenterToken)
      )
    : await auth.api.getSession({ headers: request.headers });

  if (!session) {
    throw new Unauthenticated({ message: "Sign in required" });
  }
  if (!isAdminEmail(config.adminEmails, session.user.email)) {
    throw new Forbidden({ message: "Admin access required" });
  }

  return session;
};
