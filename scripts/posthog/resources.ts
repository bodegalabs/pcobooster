/**
 * Alchemy resources for PostHog configuration. Each provider adopts an existing object by
 * its PostHog ID, compares it with the declaration, and writes only fields that differ, so
 * a deploy with no drift makes no PostHog writes.
 *
 * Deletion is conservative: projects are never deleted, and dashboards/insights are
 * soft-deleted (`deleted: true`), which PostHog can restore. `alchemy.posthog.ts` also
 * retains the project and dashboards, so Alchemy never calls their `delete`.
 */
import type { ProjectSettings } from "@pcobooster/analytics/reports";
import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Effect, Layer } from "effect";
import { z } from "zod";

import { PostHogApi, postHogApiLayer } from "./api";
import type {
  Dashboard,
  Insight,
  PostHogApiError,
  PostHogApiService,
  ProjectSnapshot,
} from "./api";
import {
  changedKeys,
  dashboardChanges,
  insightChanges,
  tileOrder,
} from "./drift";
import type { DashboardFields, InsightFields, JsonRecord, Tile } from "./drift";

const noop = { action: "noop" } as const;
const update = { action: "update" } as const;
const replace = { action: "replace" } as const;

export interface ProjectProps {
  readonly projectId: number;
  readonly settings: ProjectSettings;
}
export interface ProjectAttributes {
  readonly projectId: number;
  /** Live values of the declared setting keys only; the ingestion token is never stored. */
  readonly settings: JsonRecord;
}
export type PostHogProjectResource = Resource<
  "PostHog.Project",
  ProjectProps,
  ProjectAttributes
>;
export const PostHogProject =
  Resource<PostHogProjectResource>("PostHog.Project");

export interface DashboardProps extends DashboardFields {
  readonly projectId: number;
  /** Adopt this dashboard; omit to create one. */
  readonly dashboardId?: number;
}
export interface DashboardAttributes extends DashboardFields {
  readonly projectId: number;
  readonly dashboardId: number;
}
export type PostHogDashboardResource = Resource<
  "PostHog.Dashboard",
  DashboardProps,
  DashboardAttributes
>;
export const PostHogDashboard =
  Resource<PostHogDashboardResource>("PostHog.Dashboard");

export interface InsightProps {
  readonly projectId: number;
  /** Adopt this insight; omit to create one. */
  readonly insightId?: number;
  readonly name: string;
  readonly description: string;
  readonly favorited: boolean;
  readonly tags: readonly string[];
  /** JSON, validated on use; a recursive JSON type is too deep for Alchemy input types. */
  readonly query: unknown;
  readonly dashboardIds: number[];
}
export interface InsightAttributes extends InsightFields {
  readonly projectId: number;
  readonly insightId: number;
  readonly shortId: string;
}
export type PostHogInsightResource = Resource<
  "PostHog.Insight",
  InsightProps,
  InsightAttributes
>;
export const PostHogInsight =
  Resource<PostHogInsightResource>("PostHog.Insight");

export interface DashboardTilesProps {
  readonly projectId: number;
  readonly dashboardId: number;
  /** Insights in display order. Tiles not listed keep their order after these. */
  readonly insightIds: number[];
}
export interface DashboardTilesAttributes {
  readonly projectId: number;
  readonly dashboardId: number;
  readonly tiles: readonly Tile[];
}
export type PostHogDashboardTilesResource = Resource<
  "PostHog.DashboardTiles",
  DashboardTilesProps,
  DashboardTilesAttributes
>;
export const PostHogDashboardTiles = Resource<PostHogDashboardTilesResource>(
  "PostHog.DashboardTiles"
);

type Lifecycle<A> = Effect.Effect<A, PostHogApiError>;

const jsonRecord = z.record(z.string(), z.json());

/** Settings as the JSON record the API compares and patches. */
const settingsRecord = (settings: ProjectSettings): JsonRecord =>
  jsonRecord.parse(settings);

const pickSettings = (
  declared: ProjectSettings,
  live: ProjectSnapshot
): JsonRecord =>
  Object.fromEntries(
    Object.keys(declared).map((key) => [key, live[key] ?? null])
  );

const pickDeclared = (
  declared: JsonRecord,
  keys: readonly string[]
): JsonRecord =>
  Object.fromEntries(
    Object.entries(declared).filter(([key]) => keys.includes(key))
  );

const missing = (kind: string, id: number) =>
  Effect.die(
    new Error(
      `PostHog ${kind} ${id} does not exist or is deleted. Restore it in PostHog, or remove its ID from the definition to create a new one.`
    )
  );

export const readProject = (
  api: PostHogApiService,
  props: ProjectProps
): Lifecycle<ProjectAttributes | undefined> =>
  api.getProject(props.projectId).pipe(
    Effect.map((live) =>
      live === undefined
        ? undefined
        : {
            projectId: live.id,
            settings: pickSettings(props.settings, live),
          }
    )
  );

/** Patches only declared settings that differ; projects are adopted, never created. */
export const reconcileProject = (
  api: PostHogApiService,
  news: ProjectProps
): Lifecycle<ProjectAttributes> =>
  Effect.gen(function* reconcile() {
    const live = yield* api.getProject(news.projectId);
    if (live === undefined) {
      return yield* missing("project", news.projectId);
    }
    const declared = settingsRecord(news.settings);
    const changed = changedKeys(declared, live);
    const current =
      changed.length === 0
        ? live
        : yield* api.updateProject(
            news.projectId,
            pickDeclared(declared, changed)
          );
    return {
      projectId: current.id,
      settings: pickSettings(news.settings, current),
    };
  });

const dashboardAttributes = (
  projectId: number,
  dashboard: Dashboard
): DashboardAttributes => ({
  projectId,
  dashboardId: dashboard.dashboardId,
  name: dashboard.name,
  description: dashboard.description,
  pinned: dashboard.pinned,
  tags: dashboard.tags,
});

export const readDashboard = (
  api: PostHogApiService,
  projectId: number,
  dashboardId: number | undefined
): Lifecycle<DashboardAttributes | undefined> =>
  dashboardId === undefined
    ? Effect.undefined
    : api
        .getDashboard(projectId, dashboardId)
        .pipe(
          Effect.map((live) => live && dashboardAttributes(projectId, live))
        );

export const reconcileDashboard = (
  api: PostHogApiService,
  news: DashboardProps,
  output?: DashboardAttributes
): Lifecycle<DashboardAttributes> =>
  Effect.gen(function* reconcile() {
    const fields = {
      name: news.name,
      description: news.description,
      pinned: news.pinned,
      tags: news.tags,
    };
    const dashboardId = output?.dashboardId ?? news.dashboardId;
    if (dashboardId === undefined) {
      const created = yield* api.createDashboard(news.projectId, fields);
      return dashboardAttributes(news.projectId, created);
    }
    const live = yield* api.getDashboard(news.projectId, dashboardId);
    if (live === undefined) {
      return yield* missing("dashboard", dashboardId);
    }
    const changed = dashboardChanges(news, live);
    const current =
      changed.length === 0
        ? live
        : yield* api.updateDashboard(
            news.projectId,
            dashboardId,
            pickDeclared(fields, changed)
          );
    if (current === undefined) {
      return yield* missing("dashboard", dashboardId);
    }
    return dashboardAttributes(news.projectId, current);
  });

const insightAttributes = (
  projectId: number,
  insight: Insight
): InsightAttributes => ({ projectId, ...insight });

export const readInsight = (
  api: PostHogApiService,
  projectId: number,
  insightId: number | undefined
): Lifecycle<InsightAttributes | undefined> =>
  insightId === undefined
    ? Effect.undefined
    : api
        .getInsight(projectId, insightId)
        .pipe(Effect.map((live) => live && insightAttributes(projectId, live)));

const declaredInsight = (news: InsightProps): InsightFields => ({
  name: news.name,
  description: news.description,
  favorited: news.favorited,
  tags: news.tags,
  query: z.json().parse(news.query),
  dashboardIds: news.dashboardIds,
});

export const reconcileInsight = (
  api: PostHogApiService,
  news: InsightProps,
  output?: InsightAttributes
): Lifecycle<InsightAttributes> =>
  Effect.gen(function* reconcile() {
    const declared = declaredInsight(news);
    // `insightChanges` names the `dashboards` field after its request key.
    const body = {
      name: declared.name,
      description: declared.description,
      favorited: declared.favorited,
      tags: declared.tags,
      query: declared.query,
      dashboards: declared.dashboardIds,
    };
    const insightId = output?.insightId ?? news.insightId;
    if (insightId === undefined) {
      const created = yield* api.createInsight(news.projectId, {
        ...body,
        saved: true,
      });
      return insightAttributes(news.projectId, created);
    }
    const live = yield* api.getInsight(news.projectId, insightId);
    if (live === undefined) {
      return yield* missing("insight", insightId);
    }
    const changed = insightChanges(declared, live);
    const current =
      changed.length === 0
        ? live
        : yield* api.updateInsight(
            news.projectId,
            insightId,
            pickDeclared(body, changed)
          );
    if (current === undefined) {
      return yield* missing("insight", insightId);
    }
    return insightAttributes(news.projectId, current);
  });

export const readDashboardTiles = (
  api: PostHogApiService,
  projectId: number,
  dashboardId: number
): Lifecycle<DashboardTilesAttributes | undefined> =>
  api
    .getDashboard(projectId, dashboardId)
    .pipe(
      Effect.map((live) =>
        live === undefined
          ? undefined
          : { projectId, dashboardId, tiles: live.tiles }
      )
    );

export const reconcileDashboardTiles = (
  api: PostHogApiService,
  news: DashboardTilesProps
): Lifecycle<DashboardTilesAttributes> =>
  Effect.gen(function* reconcile() {
    const live = yield* readDashboardTiles(
      api,
      news.projectId,
      news.dashboardId
    );
    if (live === undefined) {
      return yield* missing("dashboard", news.dashboardId);
    }
    const order = tileOrder(live.tiles, news.insightIds);
    if (order === undefined) {
      return live;
    }
    yield* api.reorderTiles(news.projectId, news.dashboardId, order);
    const reordered = yield* readDashboardTiles(
      api,
      news.projectId,
      news.dashboardId
    );
    return reordered ?? (yield* missing("dashboard", news.dashboardId));
  });

const projectProvider = Provider.effect(
  PostHogProject,
  Effect.gen(function* projectProvider() {
    const api = yield* PostHogApi;
    return {
      stables: ["projectId"],
      read: ({ olds, output }) =>
        readProject(
          api,
          output === undefined
            ? olds
            : { projectId: output.projectId, settings: olds.settings }
        ),
      diff: ({ news, output }) =>
        Effect.sync(() => {
          if (!isResolved(news) || output === undefined) {
            return update;
          }
          return news.projectId === output.projectId &&
            changedKeys(settingsRecord(news.settings), output.settings)
              .length === 0
            ? noop
            : update;
        }),
      reconcile: ({ news }) => reconcileProject(api, news),
      // Projects hold all analytics data; removing one from code only forgets it.
      delete: () => Effect.void,
    };
  })
);

const dashboardProvider = Provider.effect(
  PostHogDashboard,
  Effect.gen(function* dashboardProvider() {
    const api = yield* PostHogApi;
    return {
      stables: ["projectId", "dashboardId"],
      read: ({ olds, output }) =>
        readDashboard(
          api,
          olds.projectId,
          output?.dashboardId ?? olds.dashboardId
        ),
      diff: ({ news, output }) =>
        Effect.sync(() => {
          if (!isResolved(news) || output === undefined) {
            return update;
          }
          if (
            news.projectId !== output.projectId ||
            (news.dashboardId !== undefined &&
              news.dashboardId !== output.dashboardId)
          ) {
            return replace;
          }
          return dashboardChanges(news, output).length === 0 ? noop : update;
        }),
      reconcile: ({ news, output }) => reconcileDashboard(api, news, output),
      delete: ({ output }) =>
        api
          .updateDashboard(output.projectId, output.dashboardId, {
            deleted: true,
          })
          .pipe(Effect.asVoid),
    };
  })
);

const insightProvider = Provider.effect(
  PostHogInsight,
  Effect.gen(function* insightProvider() {
    const api = yield* PostHogApi;
    return {
      stables: ["projectId", "insightId", "shortId"],
      read: ({ olds, output }) =>
        readInsight(api, olds.projectId, output?.insightId ?? olds.insightId),
      diff: ({ news, output }) =>
        Effect.sync(() => {
          if (!isResolved(news) || output === undefined) {
            return update;
          }
          if (
            news.projectId !== output.projectId ||
            (news.insightId !== undefined &&
              news.insightId !== output.insightId)
          ) {
            return replace;
          }
          return insightChanges(declaredInsight(news), output).length === 0
            ? noop
            : update;
        }),
      reconcile: ({ news, output }) => reconcileInsight(api, news, output),
      // Soft delete: the insight leaves its dashboards and can be restored in PostHog.
      delete: ({ output }) =>
        api
          .updateInsight(output.projectId, output.insightId, { deleted: true })
          .pipe(Effect.asVoid),
    };
  })
);

const dashboardTilesProvider = Provider.effect(
  PostHogDashboardTiles,
  Effect.gen(function* dashboardTilesProvider() {
    const api = yield* PostHogApi;
    return {
      stables: ["projectId", "dashboardId"],
      read: ({ olds, output }) =>
        readDashboardTiles(
          api,
          output?.projectId ?? olds.projectId,
          output?.dashboardId ?? olds.dashboardId
        ),
      diff: ({ news, output }) =>
        Effect.sync(() => {
          if (!isResolved(news) || output === undefined) {
            return update;
          }
          const placed = new Set(output.tiles.map((tile) => tile.insightId));
          return news.dashboardId === output.dashboardId &&
            news.insightIds.every((id) => placed.has(id)) &&
            tileOrder(output.tiles, news.insightIds) === undefined
            ? noop
            : update;
        }),
      reconcile: ({ news }) => reconcileDashboardTiles(api, news),
      // Tile order has no independent existence; forgetting it changes nothing.
      delete: () => Effect.void,
    };
  })
);

/** Providers for `alchemy.posthog.ts`, sharing one API client. */
export const postHogProviders = Layer.mergeAll(
  projectProvider,
  dashboardProvider,
  insightProvider,
  dashboardTilesProvider
).pipe(Layer.provide(postHogApiLayer));
