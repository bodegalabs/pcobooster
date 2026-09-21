import { DELETE as removeScheduledPerson } from "@worship-admin/api/http-routes/schedule/[planPersonId]/route";
import { PATCH as updateScheduleStatus } from "@worship-admin/api/http-routes/schedule/[planPersonId]/status/route";
import { POST as schedulePerson } from "@worship-admin/api/http-routes/schedule/route";
import type { Hono } from "hono";

const params = <T extends Record<string, string>>(value: T) => ({
  params: Promise.resolve(value),
});

export const registerRestRoutes = (app: Hono): void => {
  app.patch(
    "/api/schedule/:planPersonId/status",
    async (c) =>
      await updateScheduleStatus(
        c.req.raw,
        params({ planPersonId: c.req.param("planPersonId") ?? "" })
      )
  );
  app.delete(
    "/api/schedule/:planPersonId",
    async (c) =>
      await removeScheduledPerson(
        c.req.raw,
        params({ planPersonId: c.req.param("planPersonId") ?? "" })
      )
  );
  app.post("/api/schedule", async (c) => await schedulePerson(c.req.raw));
};
