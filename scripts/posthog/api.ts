/**
 * The PostHog REST calls the Alchemy providers need, validated with zod. The personal API
 * key stays Redacted and is sent only as a bearer header; it never enters Alchemy state.
 */
import type { JsonValue } from "@pcobooster/analytics/reports";
import { Config, Context, Data, Effect, Layer } from "effect";
import type { Redacted } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import type { HttpClientResponse } from "effect/unstable/http";
import { z } from "zod";

import type { JsonRecord, Tile } from "./drift";

export class PostHogApiError extends Data.TaggedError("PostHogApiError")<{
  readonly operation: string;
  readonly status: number | undefined;
  readonly message: string;
}> {}

const dashboardSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullish(),
  pinned: z.boolean(),
  deleted: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  tiles: z
    .array(
      z.object({
        id: z.number(),
        order: z.number().nullish(),
        insight: z.object({ id: z.number() }).nullish(),
      })
    )
    .optional(),
});

const insightSchema = z.object({
  id: z.number(),
  short_id: z.string(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  favorited: z.boolean().optional(),
  deleted: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  query: z.json(),
  dashboards: z.array(z.number()).optional(),
  dashboard_tiles: z
    .array(
      z.object({ dashboard_id: z.number(), deleted: z.boolean().nullish() })
    )
    .optional(),
});

/** Project responses include the public ingestion token; callers keep only named settings. */
const projectSchema = z
  .record(z.string(), z.json())
  .and(z.object({ id: z.number() }));

export interface Dashboard {
  readonly dashboardId: number;
  readonly name: string;
  readonly description: string;
  readonly pinned: boolean;
  readonly tags: readonly string[];
  readonly tiles: readonly Tile[];
}

export interface Insight {
  readonly insightId: number;
  readonly shortId: string;
  readonly name: string;
  readonly description: string;
  readonly favorited: boolean;
  readonly tags: readonly string[];
  readonly query: JsonValue;
  readonly dashboardIds: readonly number[];
}

export type ProjectSnapshot = z.infer<typeof projectSchema>;

const toDashboard = (value: z.infer<typeof dashboardSchema>): Dashboard => {
  const tiles = (value.tiles ?? []).map((tile, index) => ({
    tileId: tile.id,
    insightId: tile.insight?.id ?? null,
    order: tile.order ?? index,
  }));
  tiles.sort((a, b) => a.order - b.order);
  return {
    dashboardId: value.id,
    name: value.name,
    description: value.description ?? "",
    pinned: value.pinned,
    tags: value.tags ?? [],
    tiles: tiles.map(({ tileId, insightId }) => ({ tileId, insightId })),
  };
};

const toInsight = (value: z.infer<typeof insightSchema>): Insight => {
  // `dashboards` is deprecated for API-key callers; `dashboard_tiles` replaces it.
  const dashboardIds =
    value.dashboard_tiles === undefined
      ? (value.dashboards ?? [])
      : value.dashboard_tiles
          .filter((tile) => tile.deleted !== true)
          .map((tile) => tile.dashboard_id);
  return {
    insightId: value.id,
    shortId: value.short_id,
    name: value.name ?? "",
    description: value.description ?? "",
    favorited: value.favorited ?? false,
    tags: value.tags ?? [],
    query: value.query,
    dashboardIds,
  };
};

export interface PostHogApiService {
  readonly getProject: (
    projectId: number
  ) => Effect.Effect<ProjectSnapshot | undefined, PostHogApiError>;
  readonly updateProject: (
    projectId: number,
    body: JsonRecord
  ) => Effect.Effect<ProjectSnapshot, PostHogApiError>;
  readonly getDashboard: (
    projectId: number,
    dashboardId: number
  ) => Effect.Effect<Dashboard | undefined, PostHogApiError>;
  readonly createDashboard: (
    projectId: number,
    body: JsonRecord
  ) => Effect.Effect<Dashboard, PostHogApiError>;
  readonly updateDashboard: (
    projectId: number,
    dashboardId: number,
    body: JsonRecord
  ) => Effect.Effect<Dashboard | undefined, PostHogApiError>;
  readonly reorderTiles: (
    projectId: number,
    dashboardId: number,
    tileOrder: readonly number[]
  ) => Effect.Effect<void, PostHogApiError>;
  readonly getInsight: (
    projectId: number,
    insightId: number
  ) => Effect.Effect<Insight | undefined, PostHogApiError>;
  readonly createInsight: (
    projectId: number,
    body: JsonRecord
  ) => Effect.Effect<Insight, PostHogApiError>;
  readonly updateInsight: (
    projectId: number,
    insightId: number,
    body: JsonRecord
  ) => Effect.Effect<Insight | undefined, PostHogApiError>;
}

export const PostHogApi = Context.Service<PostHogApiService>("PostHogApi");

const MAX_ERROR_BODY = 500;

const projectPath = (projectId: number) => `/api/projects/${projectId}`;

const required =
  (operation: string) =>
  <A>(
    self: Effect.Effect<A | undefined, PostHogApiError>
  ): Effect.Effect<A, PostHogApiError> =>
    self.pipe(
      Effect.flatMap((value) =>
        value === undefined
          ? Effect.fail(
              new PostHogApiError({
                operation,
                status: 404,
                message: "Not found or deleted",
              })
            )
          : Effect.succeed(value)
      )
    );

const readBody = <Output>(
  operation: string,
  response: HttpClientResponse.HttpClientResponse,
  schema: z.ZodType<Output>
): Effect.Effect<Output | undefined, PostHogApiError> => {
  const fail = (message: string) =>
    new PostHogApiError({ operation, status: response.status, message });
  if (response.status === 404) {
    return Effect.undefined;
  }
  if (response.status >= 400) {
    return response.text.pipe(
      Effect.orElseSucceed(() => ""),
      Effect.flatMap((text) => Effect.fail(fail(text.slice(0, MAX_ERROR_BODY))))
    );
  }
  return response.json.pipe(
    Effect.mapError(() => fail("Response was not JSON")),
    Effect.flatMap((json) => {
      const parsed = schema.safeParse(json);
      return parsed.success
        ? Effect.succeed(parsed.data)
        : Effect.fail(fail(z.prettifyError(parsed.error)));
    })
  );
};

/** Build the client over any HttpClient; tests pass a fake one. */
export const makePostHogApi = (
  client: HttpClient.HttpClient,
  host: string,
  apiKey: Redacted.Redacted
): PostHogApiService => {
  const base = host.replace(/\/$/u, "");

  const send = <Output>(
    operation: string,
    method: "GET" | "PATCH" | "POST",
    path: string,
    schema: z.ZodType<Output>,
    body?: JsonValue
  ): Effect.Effect<Output | undefined, PostHogApiError> => {
    const request = HttpClientRequest.make(method)(`${base}${path}`).pipe(
      HttpClientRequest.bearerToken(apiKey),
      HttpClientRequest.acceptJson
    );
    return client
      .execute(
        body === undefined
          ? request
          : HttpClientRequest.bodyJsonUnsafe(request, body)
      )
      .pipe(
        Effect.mapError(
          (failure) =>
            new PostHogApiError({
              operation,
              status: undefined,
              message: failure.message,
            })
        ),
        Effect.flatMap((response) => readBody(operation, response, schema))
      );
  };

  const dashboard = (
    operation: string,
    method: "GET" | "PATCH" | "POST",
    path: string,
    body?: JsonRecord
  ) =>
    send(operation, method, path, dashboardSchema, body).pipe(
      Effect.map((value) =>
        value === undefined || value.deleted === true
          ? undefined
          : toDashboard(value)
      )
    );

  const insight = (
    operation: string,
    method: "GET" | "PATCH" | "POST",
    path: string,
    body?: JsonRecord
  ) =>
    send(operation, method, path, insightSchema, body).pipe(
      Effect.map((value) =>
        value === undefined || value.deleted === true
          ? undefined
          : toInsight(value)
      )
    );

  return {
    getProject: (projectId) =>
      send("read project", "GET", `${projectPath(projectId)}/`, projectSchema),
    updateProject: (projectId, body) =>
      send(
        "update project",
        "PATCH",
        `${projectPath(projectId)}/`,
        projectSchema,
        body
      ).pipe(required("update project")),
    getDashboard: (projectId, dashboardId) =>
      dashboard(
        "read dashboard",
        "GET",
        `${projectPath(projectId)}/dashboards/${dashboardId}/`
      ),
    createDashboard: (projectId, body) =>
      dashboard(
        "create dashboard",
        "POST",
        `${projectPath(projectId)}/dashboards/`,
        body
      ).pipe(required("create dashboard")),
    updateDashboard: (projectId, dashboardId, body) =>
      dashboard(
        "update dashboard",
        "PATCH",
        `${projectPath(projectId)}/dashboards/${dashboardId}/`,
        body
      ),
    reorderTiles: (projectId, dashboardId, tileOrder) =>
      send(
        "reorder dashboard tiles",
        "POST",
        `${projectPath(projectId)}/dashboards/${dashboardId}/reorder_tiles/`,
        z.json(),
        { tile_order: tileOrder }
      ).pipe(Effect.asVoid),
    getInsight: (projectId, insightId) =>
      insight(
        "read insight",
        "GET",
        `${projectPath(projectId)}/insights/${insightId}/`
      ),
    createInsight: (projectId, body) =>
      insight(
        "create insight",
        "POST",
        `${projectPath(projectId)}/insights/`,
        body
      ).pipe(required("create insight")),
    updateInsight: (projectId, insightId, body) =>
      insight(
        "update insight",
        "PATCH",
        `${projectPath(projectId)}/insights/${insightId}/`,
        body
      ),
  };
};

/**
 * Reads the management key only while provisioning. `POSTHOG_HOST` defaults to the US
 * cloud that hosts project 614621.
 */
export const postHogApiLayer = Layer.effect(
  PostHogApi,
  Effect.gen(function* postHogApi() {
    const apiKey = yield* Config.Redacted("POSTHOG_PERSONAL_API_KEY");
    const host = yield* Config.String("POSTHOG_HOST").pipe(
      Config.withDefault("https://us.posthog.com")
    );
    const client = yield* HttpClient.HttpClient;
    return makePostHogApi(client, host, apiKey);
  }).pipe(Effect.orDie)
).pipe(Layer.provide(FetchHttpClient.layer));
