import { ApiError } from "@worship-admin/api/http/api-error";
import { handleRoute } from "@worship-admin/api/http/route-handler";
import { authorizeAdminRequest } from "@worship-admin/api/use-cases/admin/authorize-admin";
import { getUserAccountDetail } from "@worship-admin/api/use-cases/admin/get-account-activity";
import { z } from "zod";

const paramsSchema = z.object({ userId: z.string().min(1) });

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) =>
  await handleRoute(async () => {
    await authorizeAdminRequest(request);
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    return { user: await getUserAccountDetail(parsed.data.userId) };
  });
