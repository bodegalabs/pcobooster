import {
  dashboards,
  project,
  productDashboard,
} from "@pcobooster/analytics/reports";
import type { DashboardDefinition } from "@pcobooster/analytics/reports";
import { Effect, Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { makePostHogApi } from "./api";
import type { PostHogApiError, PostHogApiService } from "./api";
import { changedKeys, tileOrder } from "./drift";
import { livePostHog } from "./fake-posthog";
import {
  reconcileDashboard,
  reconcileDashboardTiles,
  reconcileInsight,
  reconcileProject,
} from "./resources";
import type { DashboardTilesProps, InsightProps } from "./resources";

type Handler = (request: Request) => Promise<Response>;

const withApi = async <A>(
  handle: Handler,
  program: (api: PostHogApiService) => Effect.Effect<A, PostHogApiError>
): Promise<A> =>
  await Effect.runPromise(
    Effect.gen(function* withClient() {
      const client = yield* HttpClient.HttpClient;
      return yield* program(
        makePostHogApi(
          client,
          "https://posthog.test/",
          Redacted.make("phx_test")
        )
      );
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        async (input, init) => await handle(new Request(input, init))
      )
    )
  );

const forbidden: Handler = async (request) =>
  await Promise.resolve(
    new Response(request.headers.get("authorization") ?? "", { status: 403 })
  );

const notFound: Handler = async () =>
  await Promise.resolve(new Response("missing", { status: 404 }));

const projectId = project.id;

const adoptedId = (id: number | undefined): number => {
  if (id === undefined) {
    throw new Error("Every live definition carries its PostHog ID");
  }
  return id;
};

const insightProps: InsightProps[] = dashboards.flatMap((dashboard) =>
  dashboard.insights.map((insight) => ({
    projectId,
    insightId: adoptedId(insight.id),
    name: insight.name,
    description: insight.description,
    favorited: insight.favorited,
    tags: insight.tags,
    query: insight.query,
    dashboardIds: [adoptedId(dashboard.id)],
  }))
);

const firstInsight = (): InsightProps => {
  const [props] = insightProps;
  if (props === undefined) {
    throw new Error("No insights are declared");
  }
  return props;
};

const tileProps = (dashboard: DashboardDefinition): DashboardTilesProps => ({
  projectId,
  dashboardId: adoptedId(dashboard.id),
  insightIds: dashboard.insights.map((insight) => adoptedId(insight.id)),
});

const settingsRecord = z.record(z.string(), z.json()).parse(project.settings);

describe("declared PostHog configuration", () => {
  it("gives every dashboard and insight a unique key and ID", () => {
    const declared = dashboards.flatMap((dashboard) => [
      dashboard,
      ...dashboard.insights,
    ]);
    expect(new Set(declared.map((item) => item.key)).size).toBe(
      declared.length
    );
    expect(new Set(declared.map((item) => item.id)).size).toBe(declared.length);
  });

  it("round-trips every live insight query exactly", async () => {
    const fake = livePostHog();
    const live = await withApi(fake.handle, (api) =>
      Effect.all(
        insightProps.map((props) =>
          api.getInsight(projectId, adoptedId(props.insightId))
        )
      )
    );
    expect(live.map((insight) => insight?.query)).toStrictEqual(
      insightProps.map((props) => props.query)
    );
  });

  it("matches the live project settings and tile order", async () => {
    const fake = livePostHog();
    const [settings, boards] = await withApi(fake.handle, (api) =>
      Effect.all([
        api.getProject(projectId),
        Effect.all(
          dashboards.map((dashboard) =>
            api.getDashboard(projectId, adoptedId(dashboard.id))
          )
        ),
      ])
    );
    expect(changedKeys(settingsRecord, settings ?? {})).toStrictEqual([]);
    expect(boards.map((board) => board?.name)).toStrictEqual(
      dashboards.map((dashboard) => dashboard.name)
    );
    expect(
      dashboards.map((declared, index) => {
        const tiles = boards[index]?.tiles ?? [];
        return tileOrder(tiles, tileProps(declared).insightIds) ?? "in order";
      })
    ).toStrictEqual(dashboards.map(() => "in order"));
  });

  it("adopts every existing object without writing", async () => {
    const fake = livePostHog();
    await withApi(fake.handle, (api) =>
      Effect.gen(function* adoptAll() {
        yield* reconcileProject(api, { projectId, settings: project.settings });
        for (const dashboard of dashboards) {
          yield* reconcileDashboard(api, {
            projectId,
            dashboardId: dashboard.id,
            name: dashboard.name,
            description: dashboard.description,
            pinned: dashboard.pinned,
            tags: dashboard.tags,
          });
          yield* reconcileDashboardTiles(api, tileProps(dashboard));
        }
        for (const props of insightProps) {
          yield* reconcileInsight(api, props);
        }
      })
    );
    expect(fake.requests.length).toBeGreaterThan(insightProps.length);
    expect(fake.writes()).toStrictEqual([]);
  });
});

describe("PostHog providers", () => {
  it("patches only the insight fields that changed", async () => {
    const fake = livePostHog();
    const props = { ...firstInsight(), description: "Updated description" };
    const result = await withApi(fake.handle, (api) =>
      reconcileInsight(api, props)
    );
    expect(result.description).toBe("Updated description");
    expect(fake.writes()).toStrictEqual([
      {
        method: "PATCH",
        path: `/api/projects/${projectId}/insights/${props.insightId}/`,
        body: { description: "Updated description" },
      },
    ]);
  });

  it("patches only changed project settings", async () => {
    const fake = livePostHog();
    await withApi(fake.handle, (api) =>
      reconcileProject(api, {
        projectId,
        settings: {
          ...project.settings,
          session_recording_sample_rate: "0.50",
        },
      })
    );
    expect(fake.writes()).toStrictEqual([
      {
        method: "PATCH",
        path: `/api/projects/${projectId}/`,
        body: { session_recording_sample_rate: "0.50" },
      },
    ]);
  });

  it("reorders tiles to the declared order", async () => {
    const fake = livePostHog();
    const props = tileProps(productDashboard);
    const reversed = { ...props, insightIds: props.insightIds.toReversed() };
    const result = await withApi(fake.handle, (api) =>
      reconcileDashboardTiles(api, reversed)
    );
    expect(result.tiles.map((tile) => tile.insightId)).toStrictEqual(
      reversed.insightIds
    );
    expect(fake.writes().map((request) => request.path)).toStrictEqual([
      `/api/projects/${projectId}/dashboards/${props.dashboardId}/reorder_tiles/`,
    ]);
  });

  it("refuses to adopt an insight that no longer exists", async () => {
    const fake = livePostHog();
    await expect(
      withApi(fake.handle, (api) =>
        reconcileInsight(api, { ...firstInsight(), insightId: 1 })
      )
    ).rejects.toThrow(/insight 1 does not exist/u);
    expect(fake.writes()).toStrictEqual([]);
  });
});

describe(makePostHogApi, () => {
  it("sends the key as a bearer token and surfaces API errors", async () => {
    await expect(
      withApi(forbidden, (api) => api.getProject(projectId))
    ).rejects.toMatchObject({
      operation: "read project",
      status: 403,
      message: "Bearer phx_test",
    });
  });

  it("reads a 404 as absent", async () => {
    await expect(
      withApi(notFound, (api) => api.getInsight(projectId, 1))
    ).resolves.toBeUndefined();
  });
});
