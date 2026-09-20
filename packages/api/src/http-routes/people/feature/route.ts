import { peoplePageFlag } from "@worship-admin/api/people-page-flag";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) =>
  Response.json({
    enabled: await peoplePageFlag(request),
  });
