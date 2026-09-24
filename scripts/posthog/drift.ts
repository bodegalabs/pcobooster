/**
 * Pure comparison between declared PostHog configuration and what the API returns.
 * Providers use these results to decide whether a deploy writes anything at all.
 */
import type { JsonValue } from "@pcobooster/analytics/reports";

export type JsonRecord = Readonly<Record<string, JsonValue>>;

const isList = (value: JsonValue | undefined): value is readonly JsonValue[] =>
  Array.isArray(value);

const isRecord = (value: JsonValue | undefined): value is JsonRecord =>
  typeof value === "object" && value !== null && !isList(value);

/**
 * True when every declared value appears in `live`. PostHog adds defaulted keys to
 * saved objects (queries in particular), so extra live object keys are ignored.
 * Arrays must match element for element, because order and length carry meaning.
 */
export const matchesDeclared = (
  declared: JsonValue,
  live: JsonValue | undefined
): boolean => {
  if (isList(declared)) {
    return (
      isList(live) &&
      live.length === declared.length &&
      declared.every((item, index) => matchesDeclared(item, live[index]))
    );
  }
  if (isRecord(declared)) {
    return (
      isRecord(live) &&
      Object.entries(declared).every(([key, value]) =>
        matchesDeclared(value, live[key])
      )
    );
  }
  return Object.is(declared, live);
};

const sameMembers = (
  declared: readonly (string | number)[],
  live: readonly (string | number)[]
): boolean => {
  const liveSet = new Set(live);
  return (
    declared.length === liveSet.size &&
    declared.every((item) => liveSet.has(item))
  );
};

/** Keys of `declared` whose values PostHog does not currently hold. */
export const changedKeys = (declared: JsonRecord, live: JsonRecord): string[] =>
  Object.entries(declared)
    .filter(([key, value]) => !matchesDeclared(value, live[key]))
    .map(([key]) => key);

export interface DashboardFields {
  readonly name: string;
  readonly description: string;
  readonly pinned: boolean;
  readonly tags: readonly string[];
}

/** Tags are an unordered set in PostHog. */
export const dashboardChanges = (
  declared: DashboardFields,
  live: DashboardFields
): string[] => [
  ...changedKeys(
    {
      name: declared.name,
      description: declared.description,
      pinned: declared.pinned,
    },
    { name: live.name, description: live.description, pinned: live.pinned }
  ),
  ...(sameMembers(declared.tags, live.tags) ? [] : ["tags"]),
];

export interface InsightFields {
  readonly name: string;
  readonly description: string;
  readonly favorited: boolean;
  readonly tags: readonly string[];
  readonly query: JsonValue;
  readonly dashboardIds: readonly number[];
}

/** Field names match the PATCH body; membership is sent as `dashboards`. */
export const insightChanges = (
  declared: InsightFields,
  live: InsightFields
): string[] => [
  ...changedKeys(
    {
      name: declared.name,
      description: declared.description,
      favorited: declared.favorited,
      query: declared.query,
    },
    {
      name: live.name,
      description: live.description,
      favorited: live.favorited,
      query: live.query,
    }
  ),
  ...(sameMembers(declared.tags, live.tags) ? [] : ["tags"]),
  ...(sameMembers(declared.dashboardIds, live.dashboardIds)
    ? []
    : ["dashboards"]),
];

export interface Tile {
  readonly tileId: number;
  readonly insightId: number | null;
}

/**
 * Tile IDs in display order: declared insights first, in declared order, then any
 * other tiles (text cards or insights added in the UI) in their current order.
 * Undefined when the dashboard already shows declared insights in that order.
 */
export const tileOrder = (
  tiles: readonly Tile[],
  insightIds: readonly number[]
): number[] | undefined => {
  const byInsight = new Map(
    tiles.flatMap((tile) =>
      tile.insightId === null ? [] : [[tile.insightId, tile.tileId] as const]
    )
  );
  const declared = insightIds.flatMap((id) => {
    const tileId = byInsight.get(id);
    return tileId === undefined ? [] : [tileId];
  });
  const declaredSet = new Set(declared);
  const order = [
    ...declared,
    ...tiles
      .map((tile) => tile.tileId)
      .filter((tileId) => !declaredSet.has(tileId)),
  ];
  const current = tiles.map((tile) => tile.tileId);
  return order.every((tileId, index) => tileId === current[index])
    ? undefined
    : order;
};
