import { peoplePageFlag } from "@/flags";

export const dynamic = "force-dynamic";

export const GET = async () =>
  Response.json({
    enabled: await peoplePageFlag(),
  });
