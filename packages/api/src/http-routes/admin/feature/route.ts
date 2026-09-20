import { auth } from "@worship-admin/api/auth";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@worship-admin/api/auth/dev-bypass";
import { handleRoute } from "@worship-admin/api/http/route-handler";
import { isAdminEmail } from "@worship-admin/api/use-cases/admin/get-account-activity";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) =>
  await handleRoute(async () => {
    const session = isDevAuthBypassEnabled()
      ? getDevBypassSession(await loadDevBypassIdentity())
      : await auth.api.getSession({
          headers: request.headers,
        });

    return {
      enabled: isAdminEmail(session?.user.email),
    };
  });
