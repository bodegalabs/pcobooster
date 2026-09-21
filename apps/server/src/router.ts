import {
  DELETE as deletePlanItem,
  PATCH as updatePlanItem,
} from "@worship-admin/api/http-routes/plan-items/[id]/route";
import { POST as reorderPlanItems } from "@worship-admin/api/http-routes/plan-items/reorder/route";
import {
  GET as getPlanItems,
  POST as createPlanItem,
} from "@worship-admin/api/http-routes/plan-items/route";
import { PATCH as updatePlanPersonTimes } from "@worship-admin/api/http-routes/plan-people/[planPersonId]/times/route";
import {
  DELETE as deletePlanTime,
  PATCH as updatePlanTime,
} from "@worship-admin/api/http-routes/plan-times/[planTimeId]/route";
import {
  GET as getPlanTimes,
  POST as createPlanTime,
} from "@worship-admin/api/http-routes/plans/[planId]/times/route";
import { DELETE as removeScheduledPerson } from "@worship-admin/api/http-routes/schedule/[planPersonId]/route";
import { PATCH as updateScheduleStatus } from "@worship-admin/api/http-routes/schedule/[planPersonId]/status/route";
import { POST as schedulePerson } from "@worship-admin/api/http-routes/schedule/route";
import { GET as getSongOptions } from "@worship-admin/api/http-routes/songs/[songId]/options/route";
import { GET as searchSongs } from "@worship-admin/api/http-routes/songs/search/route";
import type { Hono } from "hono";

const params = <T extends Record<string, string>>(value: T) => ({
  params: Promise.resolve(value),
});

export const registerRestRoutes = (app: Hono): void => {
  app.post(
    "/api/plan-items/reorder",
    async (c) => await reorderPlanItems(c.req.raw)
  );
  app.patch(
    "/api/plan-items/:id",
    async (c) =>
      await updatePlanItem(c.req.raw, params({ id: c.req.param("id") ?? "" }))
  );
  app.delete(
    "/api/plan-items/:id",
    async (c) =>
      await deletePlanItem(c.req.raw, params({ id: c.req.param("id") ?? "" }))
  );
  app.get("/api/plan-items", async (c) => await getPlanItems(c.req.raw));
  app.post("/api/plan-items", async (c) => await createPlanItem(c.req.raw));
  app.patch(
    "/api/plan-people/:planPersonId/times",
    async (c) =>
      await updatePlanPersonTimes(
        c.req.raw,
        params({ planPersonId: c.req.param("planPersonId") ?? "" })
      )
  );
  app.patch(
    "/api/plan-times/:planTimeId",
    async (c) =>
      await updatePlanTime(
        c.req.raw,
        params({ planTimeId: c.req.param("planTimeId") ?? "" })
      )
  );
  app.delete(
    "/api/plan-times/:planTimeId",
    async (c) =>
      await deletePlanTime(
        c.req.raw,
        params({ planTimeId: c.req.param("planTimeId") ?? "" })
      )
  );
  app.get(
    "/api/plans/:planId/times",
    async (c) =>
      await getPlanTimes(
        c.req.raw,
        params({ planId: c.req.param("planId") ?? "" })
      )
  );
  app.post(
    "/api/plans/:planId/times",
    async (c) =>
      await createPlanTime(
        c.req.raw,
        params({ planId: c.req.param("planId") ?? "" })
      )
  );
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
  app.get(
    "/api/songs/:songId/options",
    async (c) =>
      await getSongOptions(
        c.req.raw,
        params({ songId: c.req.param("songId") ?? "" })
      )
  );
  app.get("/api/songs/search", async (c) => await searchSongs(c.req.raw));
};
