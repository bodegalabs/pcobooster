import { queryKeys } from "@pcobooster/client/query-keys";
import type {
  PlanItem,
  PlanTime,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlanOverviewTab } from "@/components/schedule/plan-overview-tab";

const createClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  client.setQueryData(queryKeys.organizationTimeZone(), {
    timeZone: "America/Los_Angeles",
  });
  return client;
};

const loadedQuery = <T>(data: T) => {
  const client = createClient();
  const queryKey = ["loaded"];
  client.setQueryData(queryKey, data);
  return new QueryObserver<T>(client, {
    queryKey,
    enabled: false,
  }).getCurrentResult();
};

const failedQuery = async <T>(
  client: QueryClient,
  queryKey: readonly unknown[],
  data?: T
) => {
  const options = {
    queryKey,
    queryFn: async (): Promise<T> =>
      await Promise.reject(new Error("Planning Center request failed.")),
  };
  if (data !== undefined) {
    client.setQueryData(queryKey, data);
  }
  await expect(client.query(options)).rejects.toThrow(
    "Planning Center request failed."
  );
  return new QueryObserver(client, options).getCurrentResult();
};

const renderOverview = async (
  client: QueryClient,
  props: Partial<ComponentProps<typeof PlanOverviewTab>> = {}
) => {
  const routeTree = createRootRoute({
    component: () =>
      createElement(PlanOverviewTab, {
        serviceTypeId: "service",
        planId: "plan",
        selectedPlan: null,
        teamPositionsQuery: loadedQuery<TeamPositionGroup[]>([]),
        planTimesQuery: loadedQuery<PlanTime[]>([]),
        getSlotIntentProps: () => ({
          onPointerEnter: () => {},
          onPointerLeave: () => {},
          onFocus: () => {},
          onBlur: () => {},
        }),
        ...props,
      }),
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(RouterProvider, { router })
    )
  ).replaceAll("&#x27;", "'");
};

describe("plan Overview failed reads", () => {
  it("replaces a failed songs skeleton with an error and retry, while keeping loaded sections", async () => {
    const client = createClient();
    await failedQuery<PlanItem[]>(
      client,
      queryKeys.planItems("service", "plan")
    );
    const markup = await renderOverview(client);
    expect(markup).toContain("Couldn't load songs");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain('data-slot="skeleton"');
    expect(markup).toContain("No times on this plan yet.");
    expect(markup).toContain("Readiness could not be fully checked.");
  });

  it("stops the People and Times skeletons when those reads fail", async () => {
    const client = createClient();
    client.setQueryData(queryKeys.planItems("service", "plan"), []);
    const markup = await renderOverview(client, {
      teamPositionsQuery: await failedQuery<TeamPositionGroup[]>(
        createClient(),
        ["people"]
      ),
      planTimesQuery: await failedQuery<PlanTime[]>(createClient(), ["times"]),
    });
    expect(markup).toContain("Couldn't load people");
    expect(markup).toContain("Couldn't load times");
    expect(markup).not.toContain('data-slot="skeleton"');
    expect(markup).toContain("No songs in the order of service yet.");
    expect(markup).not.toContain("Everything we can check looks ready.");
  });

  it("keeps cached data after a failed refresh, with an incomplete readiness notice", async () => {
    const client = createClient();
    await failedQuery<PlanItem[]>(
      client,
      queryKeys.planItems("service", "plan"),
      []
    );
    const markup = await renderOverview(client);
    expect(markup).toContain("Couldn't load songs");
    expect(markup).toContain("No songs in the order of service yet.");
    expect(markup).toContain("Readiness could not be fully checked.");
    expect(markup).not.toContain('data-slot="skeleton"');
  });

  it("still shows skeletons for genuinely pending reads", async () => {
    const markup = await renderOverview(createClient());
    expect(markup).toContain('data-slot="skeleton"');
    expect(markup).not.toContain("Couldn't load songs");
  });

  it("returns to loaded content after retry succeeds", async () => {
    const client = createClient();
    const queryKey = queryKeys.planItems("service", "plan");
    let failing = true;
    const queryFn = async (): Promise<PlanItem[]> => {
      if (failing) {
        return await Promise.reject(
          new Error("Planning Center request failed.")
        );
      }
      return [];
    };
    await expect(client.query({ queryKey, queryFn })).rejects.toThrow(
      "Planning Center request failed."
    );
    await expect(renderOverview(client)).resolves.toContain(
      "Couldn't load songs"
    );
    failing = false;
    await new QueryObserver(client, { queryKey, queryFn }).refetch();
    const markup = await renderOverview(client);
    expect(markup).not.toContain("Couldn't load songs");
    expect(markup).not.toMatch(
      /Readiness could not be fully checked|data-slot="skeleton"/u
    );
    expect(markup).toContain("No songs in the order of service yet.");
  });
});
