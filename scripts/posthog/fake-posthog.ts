/**
 * An in-memory PostHog REST API seeded with the live project as read on 2026-09-23
 * (`fixtures/`, copied from read-only API responses without user or token fields).
 * Tests use it to prove adoption is a no-op; it can also back a local dry run when no
 * personal API key is available.
 */
import { z } from "zod";

import liveDashboards from "./fixtures/live-dashboards.json" with { type: "json" };
import liveProject from "./fixtures/live-project.json" with { type: "json" };

const jsonRecord = z.record(z.string(), z.json());
const insightSchema = z.object({
  id: z.number(),
  short_id: z.string(),
  name: z.string(),
  description: z.string(),
  favorited: z.boolean(),
  tags: z.array(z.string()),
  query: z.json(),
});
const dashboardSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  pinned: z.boolean(),
  deleted: z.boolean(),
  tags: z.array(z.string()),
  tiles: z.array(
    z.object({
      id: z.number(),
      order: z.number(),
      layouts: jsonRecord,
      insight: insightSchema,
    })
  ),
});
const tileOrderSchema = z.object({ tile_order: z.array(z.number()) });
const insightPatchSchema = insightSchema
  .omit({ id: true, short_id: true })
  .extend({ deleted: z.boolean(), dashboards: z.array(z.number()) })
  .partial();

type StoredInsight = z.infer<typeof insightSchema> & {
  deleted: boolean;
  dashboardIds: number[];
};

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly body: z.infer<typeof jsonRecord> | undefined;
}

const ROUTE =
  /^\/api\/projects\/(?<project>\d+)\/(?:(?<kind>dashboards|insights)\/(?<id>\d+)\/(?<action>reorder_tiles\/)?)?$/u;

const notFound = () => new Response("Not found", { status: 404 });

const insightResponse = ({ dashboardIds, ...insight }: StoredInsight) => ({
  ...insight,
  dashboards: dashboardIds,
  dashboard_tiles: dashboardIds.map((dashboardId) => ({
    dashboard_id: dashboardId,
    deleted: null,
  })),
});

export const livePostHog = () => {
  const project = jsonRecord.parse(liveProject);
  const dashboards = z.array(dashboardSchema).parse(liveDashboards);
  const insights = new Map<number, StoredInsight>(
    dashboards.flatMap((dashboard) =>
      dashboard.tiles.map((tile) => [
        tile.insight.id,
        { ...tile.insight, deleted: false, dashboardIds: [dashboard.id] },
      ])
    )
  );
  const requests: RecordedRequest[] = [];

  const dashboardRoute = (
    method: string,
    id: number,
    reorder: boolean,
    body: z.infer<typeof jsonRecord>
  ): Response => {
    const dashboard = dashboards.find((item) => item.id === id);
    if (dashboard === undefined) {
      return notFound();
    }
    if (reorder && method === "POST") {
      const { tile_order: order } = tileOrderSchema.parse(body);
      dashboard.tiles.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      for (const [index, tile] of dashboard.tiles.entries()) {
        tile.order = index;
      }
      return Response.json({ ok: true });
    }
    if (method === "PATCH") {
      Object.assign(
        dashboard,
        dashboardSchema.omit({ id: true, tiles: true }).partial().parse(body)
      );
    }
    return Response.json(dashboard);
  };

  const insightRoute = (
    method: string,
    id: number,
    body: z.infer<typeof jsonRecord>
  ): Response => {
    const insight = insights.get(id);
    if (insight === undefined) {
      return notFound();
    }
    if (method === "PATCH") {
      const { dashboards: dashboardIds, ...fields } =
        insightPatchSchema.parse(body);
      Object.assign(insight, fields);
      if (dashboardIds !== undefined) {
        insight.dashboardIds = dashboardIds;
      }
    }
    return Response.json(insightResponse(insight));
  };

  const handle = async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const text = await request.text();
    const body = text === "" ? undefined : jsonRecord.parse(JSON.parse(text));
    requests.push({ method: request.method, path: pathname, body });
    const groups = ROUTE.exec(pathname)?.groups;
    if (groups === undefined || Number(groups.project) !== project.id) {
      return notFound();
    }
    const id = Number(groups.id);
    if (groups.kind === "dashboards") {
      return dashboardRoute(
        request.method,
        id,
        groups.action !== undefined,
        body ?? {}
      );
    }
    if (groups.kind === "insights") {
      return insightRoute(request.method, id, body ?? {});
    }
    if (request.method === "PATCH") {
      Object.assign(project, body);
    }
    return Response.json(project);
  };

  const writes = () => requests.filter((request) => request.method !== "GET");

  return { handle, requests, writes };
};
