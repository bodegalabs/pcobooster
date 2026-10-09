/**
 * An in-memory PostHog REST API seeded with the live project as read on 2026-09-23
 * (`fixtures/`, copied from read-only API responses without user or token fields).
 * Tests use it to prove adoption is a no-op; it can also back a local dry run when no
 * personal API key is available.
 */
import { Schema, Struct } from "effect";
import type { Types } from "effect";

import liveDashboards from "./fixtures/live-dashboards.json" with { type: "json" };
import liveProject from "./fixtures/live-project.json" with { type: "json" };

const jsonRecord = Schema.Record(Schema.String, Schema.MutableJson);
type JsonRecord = typeof jsonRecord.Type;
const mutableArray = <Item extends Schema.Top>(item: Item) =>
  Schema.mutable(Schema.Array(item));
const insightFields = {
  name: Schema.String,
  description: Schema.String,
  favorited: Schema.Boolean,
  tags: mutableArray(Schema.String),
  query: Schema.MutableJson,
};
const insightSchema = Schema.Struct({
  id: Schema.Finite,
  short_id: Schema.String,
  ...insightFields,
});
const dashboardFields = {
  name: Schema.String,
  description: Schema.String,
  pinned: Schema.Boolean,
  deleted: Schema.Boolean,
  tags: mutableArray(Schema.String),
};
const dashboardSchema = Schema.Struct({
  id: Schema.Finite,
  ...dashboardFields,
  tiles: mutableArray(
    Schema.Struct({
      id: Schema.Finite,
      order: Schema.Finite,
      layouts: jsonRecord,
      insight: insightSchema,
    })
  ),
});
type Dashboard = Types.DeepMutable<typeof dashboardSchema.Type>;
const decodeTileOrder = Schema.decodeUnknownSync(
  Schema.Struct({ tile_order: Schema.Array(Schema.Finite) })
);
const decodeDashboardPatch = Schema.decodeUnknownSync(
  Schema.Struct(dashboardFields).mapFields(Struct.map(Schema.optional))
);
const decodeInsightPatch = Schema.decodeUnknownSync(
  Schema.Struct({
    ...insightFields,
    deleted: Schema.Boolean,
    dashboards: mutableArray(Schema.Finite),
  }).mapFields(Struct.map(Schema.optional))
);
const decodeJsonRecord = Schema.decodeUnknownSync(jsonRecord);

type StoredInsight = typeof insightSchema.Type & {
  deleted: boolean;
  dashboardIds: number[];
};

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly body: JsonRecord | undefined;
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
  const project = decodeJsonRecord(liveProject);
  const dashboards: Dashboard[] = Schema.decodeUnknownSync(
    mutableArray(dashboardSchema)
  )(liveDashboards);
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
    body: JsonRecord
  ): Response => {
    const dashboard = dashboards.find((item) => item.id === id);
    if (dashboard === undefined) {
      return notFound();
    }
    if (reorder && method === "POST") {
      const { tile_order: order } = decodeTileOrder(body);
      dashboard.tiles.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      for (const [index, tile] of dashboard.tiles.entries()) {
        tile.order = index;
      }
      return Response.json({ ok: true });
    }
    if (method === "PATCH") {
      Object.assign(dashboard, decodeDashboardPatch(body));
    }
    return Response.json(dashboard);
  };

  const insightRoute = (
    method: string,
    id: number,
    body: JsonRecord
  ): Response => {
    const insight = insights.get(id);
    if (insight === undefined) {
      return notFound();
    }
    if (method === "PATCH") {
      const { dashboards: dashboardIds, ...fields } = decodeInsightPatch(body);
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
    const body =
      text === ""
        ? undefined
        : Schema.decodeUnknownSync(Schema.fromJsonString(jsonRecord))(text);
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
