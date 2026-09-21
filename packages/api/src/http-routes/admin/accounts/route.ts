import { handleRoute } from "@worship-admin/api/http/route-handler";
import { authorizeAdminRequest } from "@worship-admin/api/use-cases/admin/authorize-admin";
import { getAccountActivity } from "@worship-admin/api/use-cases/admin/get-account-activity";

export const GET = async (request: Request) =>
  await handleRoute(async () => {
    const session = await authorizeAdminRequest(request);
    return {
      email: session.user.email,
      accounts: await getAccountActivity(),
    };
  });
