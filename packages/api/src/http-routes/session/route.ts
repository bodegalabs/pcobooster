import { auth } from "@worship-admin/api/auth";
import { isDevAuthBypassEnabled } from "@worship-admin/api/auth/dev-bypass";
import { handleRoute } from "@worship-admin/api/http/route-handler";

export const GET = async (request: Request) =>
  await handleRoute(async () => {
    if (isDevAuthBypassEnabled()) {
      return { authenticated: true };
    }

    const session = await auth.api.getSession({ headers: request.headers });
    return { authenticated: session !== null };
  });
