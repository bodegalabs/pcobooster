/**
 * PostHog project settings, dashboards, and saved insights, reviewed as code.
 * `alchemy.posthog.ts` reconciles these definitions with project 614621.
 *
 * Objects that already exist carry their PostHog `id`, so reconciliation adopts and
 * updates them in place and their URLs stay stable. A definition without an `id` is
 * created on the next deploy. Event names and property keys are typed against the
 * browser allowlist in `./privacy`, so a report cannot query data that is never sent.
 */
import type { AnalyticsEvent, AnalyticsProperty } from "./privacy";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A saved insight's `query`, stored verbatim by PostHog. */
export interface InsightQuery {
  readonly [key: string]: JsonValue;
}

export interface InsightDefinition {
  /** Stable logical ID; renaming it makes Alchemy treat the insight as new. */
  readonly key: string;
  readonly id?: number;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly favorited: boolean;
  readonly query: InsightQuery;
}

export interface DashboardDefinition {
  readonly key: string;
  readonly id?: number;
  readonly name: string;
  readonly description: string;
  readonly pinned: boolean;
  readonly tags: readonly string[];
  /** Tiles, top to bottom. Each insight belongs to exactly this dashboard. */
  readonly insights: readonly InsightDefinition[];
}

/** Project settings owned by code; every other project setting stays untouched. */
export interface ProjectSettings {
  readonly name: string;
  readonly product_description: string;
  readonly timezone: string;
  readonly app_urls: readonly string[];
  readonly recording_domains: readonly string[];
  readonly anonymize_ips: boolean;
  readonly autocapture_opt_out: boolean;
  readonly autocapture_exceptions_opt_in: boolean;
  readonly autocapture_web_vitals_opt_in: boolean;
  readonly capture_console_log_opt_in: boolean;
  readonly capture_performance_opt_in: boolean;
  readonly capture_dead_clicks: boolean;
  readonly heatmaps_opt_in: boolean;
  readonly surveys_opt_in: boolean;
  readonly session_recording_opt_in: boolean;
  /** PostHog stores the replay sample rate as a decimal string. */
  readonly session_recording_sample_rate: string;
  readonly session_recording_minimum_duration_milliseconds: number;
  readonly session_recording_retention_period: string;
  readonly session_recording_masking_config: {
    readonly blockSelector: string;
    readonly maskAllInputs: boolean;
    readonly maskTextSelector: string;
  };
  readonly session_recording_network_payload_capture_config: {
    readonly recordBody: boolean;
    readonly recordHeaders: boolean;
  };
  readonly primary_dashboard: number;
}

export interface ProjectDefinition {
  readonly id: number;
  readonly settings: ProjectSettings;
}

const last30Days = {
  date_from: "-30d",
  explicitDate: false,
  excludeIncompletePeriods: false,
};

const eventProperty = (key: AnalyticsProperty, value: string) => ({
  key,
  type: "event",
  value: [value],
  operator: "exact",
});

const marketingPages = [eventProperty("surface", "marketing")];
const authenticatedAppPages = [
  eventProperty("surface", "app"),
  eventProperty("is_authenticated", "true"),
];

type Math = "dau" | "weekly_active" | "monthly_active" | "total";
type EventProperty = ReturnType<typeof eventProperty>;

// PostHog stores series nodes with only the keys that were set, so each node shape has
// its own constructor and saved queries round-trip exactly.

/** A funnel step on any occurrence of the event. */
const step = (event: AnalyticsEvent) => ({ kind: "EventsNode", event });

/** A funnel step restricted by event properties. */
const filteredStep = (
  event: AnalyticsEvent,
  properties: readonly EventProperty[]
) => ({ kind: "EventsNode", event, properties });

/** A trend series: people (`dau`, `weekly_active`, ...) or event totals. */
const measure = (
  event: AnalyticsEvent,
  math: Math,
  properties: readonly EventProperty[]
) => ({ kind: "EventsNode", math, event, properties });

type EventsNode = ReturnType<typeof measure>;
type FunnelStep = ReturnType<typeof step> | ReturnType<typeof filteredStep>;

const trendsSource = (series: readonly EventsNode[]) => ({
  kind: "TrendsQuery",
  series,
  version: 4,
  interval: "day",
  dateRange: last30Days,
  properties: [],
  filterTestAccounts: false,
});

/** Daily line chart. */
const trend = (series: readonly EventsNode[]): InsightQuery => ({
  kind: "InsightVizNode",
  source: trendsSource(series),
});

/** The table display settings PostHog saved with each breakdown table. */
const actionsTable = {
  display: "ActionsTable",
  showLegend: false,
  hideWeekends: false,
  metricSummary: "total",
  legendPosition: "bottom",
  yAxisScaleType: "linear",
  showAnnotations: true,
  metricShowChange: true,
  yAxisStartAtZero: true,
  showMultipleYAxes: false,
  showValuesOnSeries: false,
  smoothingIntervals: 1,
  showPercentStackView: false,
  stackBreakdownValues: false,
  aggregationAxisFormat: "numeric",
  resultCustomizationBy: "value",
  excludeBoxPlotOutliers: true,
  metricColorByDirection: false,
  showAlertThresholdLines: false,
};

/** Totals over the date range, one row per value of an event property. */
const breakdownTable = (
  series: EventsNode,
  property: AnalyticsProperty
): InsightQuery => ({
  kind: "InsightVizNode",
  source: {
    ...trendsSource([series]),
    trendsFilter: actionsTable,
    breakdownFilter: {
      breakdowns: [{ type: "event", property }],
      breakdown_type: "event",
    },
  },
});

/** Ordered steps completed by the same person within the window. */
const funnel = (
  steps: readonly FunnelStep[],
  window: { readonly interval: number; readonly unit: "hour" | "day" }
): InsightQuery => ({
  kind: "InsightVizNode",
  source: {
    kind: "FunnelsQuery",
    series: steps,
    version: 2,
    dateRange: last30Days,
    properties: [],
    funnelsFilter: {
      layout: "vertical",
      exclusions: [],
      showLegend: false,
      funnelVizType: "steps",
      legendPosition: "bottom",
      funnelOrderType: "ordered",
      showAnnotations: true,
      showValuesOnSeries: false,
      funnelStepReference: "total",
      funnelWindowInterval: window.interval,
      breakdownAttributionType: "first_touch",
      funnelWindowIntervalUnit: window.unit,
      hideIncompleteConversionWindowPeriods: false,
    },
    filterTestAccounts: false,
  },
});

const marketingVisitors = measure("$pageview", "dau", marketingPages);
const appUsers = (math: Math) =>
  measure("$pageview", math, authenticatedAppPages);
const tags = ["pcobooster"];

export const marketingDashboard: DashboardDefinition = {
  key: "MarketingDashboard",
  id: 2_127_632,
  name: "Marketing & conversion",
  description:
    "pcobooster.com visitors, acquisition channels, devices, and conversion into authenticated app use. Production only. No recordings. Empty until the analytics release is deployed.",
  pinned: true,
  tags: ["pcobooster", "marketing"],
  insights: [
    {
      key: "DailyMarketingVisitors",
      id: 12_152_286,
      name: "Daily marketing visitors",
      description:
        "Unique visitors to the public marketing pages each day. Cookie/browser-based until sign-in; not a count of registered users.",
      tags,
      favorited: true,
      query: trend([marketingVisitors]),
    },
    {
      key: "MarketingAcquisitionSources",
      id: 12_152_287,
      name: "Marketing acquisition sources",
      description:
        "Unique marketing visitors by referring domain over the selected period.",
      tags,
      favorited: true,
      query: breakdownTable(marketingVisitors, "$referring_domain"),
    },
    {
      key: "MarketingCampaigns",
      id: 12_152_289,
      name: "Marketing campaigns",
      description:
        "Unique marketing visitors by utm_campaign. Use utm_source, utm_medium, and utm_campaign on shared links.",
      tags,
      favorited: true,
      query: breakdownTable(marketingVisitors, "utm_campaign"),
    },
    {
      key: "MarketingDevices",
      id: 12_152_291,
      name: "Marketing devices",
      description: "Unique marketing visitors by desktop, mobile, and tablet.",
      tags,
      favorited: true,
      query: breakdownTable(marketingVisitors, "$device_type"),
    },
    {
      key: "MarketingPages",
      id: 12_152_296,
      name: "Marketing pages",
      description:
        "Unique visitors by public page path. Queries and fragments are removed before capture.",
      tags,
      favorited: true,
      query: breakdownTable(marketingVisitors, "$pathname"),
    },
    {
      key: "MarketingToAppConversion",
      id: 12_152_297,
      name: "Marketing to app conversion",
      description:
        "Visitors who view marketing, click Open app, then reach an authenticated app session within 7 days. Includes returning users; not a signup funnel.",
      tags,
      favorited: true,
      query: funnel(
        [
          filteredStep("$pageview", marketingPages),
          step("marketing cta clicked"),
          step("app opened"),
        ],
        { interval: 7, unit: "day" }
      ),
    },
  ],
};

const workflowFailures = measure("workflow failed", "total", []);

/** The project's default dashboard. */
const productDashboardId = 2_127_633;

export const productDashboard: DashboardDefinition = {
  key: "ProductDashboard",
  id: productDashboardId,
  name: "Product usage & health",
  description:
    "Authenticated active users, feature adoption, weekly retention, and confirmed workflow outcomes for pcobooster.com. Demo and preview traffic excluded. Client-observed analytics, not uptime monitoring.",
  pinned: true,
  tags: ["pcobooster", "product"],
  insights: [
    {
      key: "ActiveAppUsers",
      id: 12_152_298,
      name: "Active app users — daily, weekly, monthly",
      description:
        "Distinct authenticated users with an app pageview. Weekly/monthly series use rolling windows. Demo traffic is excluded before capture.",
      tags,
      favorited: true,
      query: trend([
        appUsers("dau"),
        appUsers("weekly_active"),
        appUsers("monthly_active"),
      ]),
    },
    {
      key: "FeatureAdoption",
      id: 12_152_299,
      name: "Feature adoption",
      description:
        "Unique authenticated users by app page or plan workspace view. Provider IDs are replaced with route placeholders.",
      tags,
      favorited: true,
      query: breakdownTable(appUsers("dau"), "$pathname"),
    },
    {
      key: "WeeklyAppRetention",
      id: 12_152_307,
      name: "Weekly app retention",
      description:
        "Weekly return rate after first observed app open. New cohort means first tracked use, not account creation. Recent cohorts need time to mature.",
      tags,
      favorited: true,
      query: {
        kind: "InsightVizNode",
        source: {
          kind: "RetentionQuery",
          version: 2,
          dateRange: { ...last30Days, date_from: "-8w" },
          properties: [],
          retentionFilter: {
            period: "Week",
            targetEntity: {
              id: "app opened" satisfies AnalyticsEvent,
              type: "events",
            },
            retentionType: "retention_first_time",
            totalIntervals: 8,
            aggregationType: "count",
            returningEntity: {
              id: "$pageview" satisfies AnalyticsEvent,
              type: "events",
              properties: authenticatedAppPages,
            },
            cohortLabelStartIndex: 0,
            aggregationPropertyType: "event",
          },
          filterTestAccounts: false,
        },
      },
    },
    {
      key: "CompletedWorkflows",
      id: 12_152_310,
      name: "Completed workflows",
      description:
        "Confirmed scheduling, plan-item, plan-time, and account-switch operations. Counts after the server responds; optimistic UI does not count as success.",
      tags,
      favorited: true,
      query: breakdownTable(
        measure("workflow completed", "total", []),
        "operation"
      ),
    },
    {
      key: "WorkflowFailures",
      id: 12_152_311,
      name: "Workflow failures",
      description:
        "Failed user-initiated writes by operation. Cancellations and background reads are excluded; this is client-observed health, not server uptime.",
      tags,
      favorited: true,
      query: breakdownTable(workflowFailures, "operation"),
    },
    {
      key: "FailureReasons",
      id: 12_152_312,
      name: "Failure reasons",
      description:
        "Safe error codes only. Raw messages, request bodies, and provider data are never sent.",
      tags,
      favorited: true,
      query: breakdownTable(workflowFailures, "error_code"),
    },
    {
      key: "SignInToAppConversion",
      id: 12_152_319,
      name: "Sign-in to app conversion",
      description:
        "Sign-in clicks followed by authenticated app open within one hour. A drop can mean abandonment or provider login failure.",
      tags,
      favorited: true,
      query: funnel([step("sign in started"), step("app opened")], {
        interval: 1,
        unit: "hour",
      }),
    },
  ],
};

export const dashboards: readonly DashboardDefinition[] = [
  marketingDashboard,
  productDashboard,
];

export const project: ProjectDefinition = {
  id: 614_621,
  settings: {
    name: "pcobooster.com",
    product_description:
      "Lean marketing and product analytics for pcobooster.com. Sampled masked replay only after authenticated app access; no marketing/auth/demo recordings. Vercel remains the feature-flag provider.",
    timezone: "America/Los_Angeles",
    app_urls: ["https://pcobooster.com"],
    recording_domains: ["https://pcobooster.com"],
    anonymize_ips: false,
    // Mirrors the live project. The browser SDK configuration in `./client` decides what
    // is actually captured; see docs/analytics.md before relying on these toggles.
    autocapture_opt_out: false,
    autocapture_exceptions_opt_in: false,
    autocapture_web_vitals_opt_in: true,
    capture_console_log_opt_in: true,
    capture_performance_opt_in: true,
    capture_dead_clicks: false,
    heatmaps_opt_in: true,
    surveys_opt_in: false,
    session_recording_opt_in: true,
    session_recording_sample_rate: "0.20",
    session_recording_minimum_duration_milliseconds: 10_000,
    session_recording_retention_period: "30d",
    session_recording_masking_config: {
      blockSelector: "img, svg, canvas, video, audio, iframe, object, embed",
      maskAllInputs: true,
      maskTextSelector: "*",
    },
    session_recording_network_payload_capture_config: {
      recordBody: false,
      recordHeaders: false,
    },
    primary_dashboard: productDashboardId,
  },
};
