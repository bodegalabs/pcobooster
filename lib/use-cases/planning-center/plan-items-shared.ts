import { findIncluded } from "@/lib/planning-center/utils";
import type {
  ArrangementOption,
  KeyOption,
  LayoutOption,
  PCResource,
  PlanItem,
  PlanItemArrangement,
  PlanItemKey,
  PlanItemServicePosition,
  PlanItemSong,
  PlanItemType,
  RawArrangement,
  RawItem,
  RawKey,
  RawSong,
  SongCatalogEntry,
} from "@/lib/types";

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getKeyDisplayName(attributes: RawKey["attributes"]): string {
  const name = toText(attributes.name).trim();
  if (name) return name;

  const startingKey =
    typeof attributes.starting_key === "string"
      ? attributes.starting_key.trim()
      : "";
  const endingKey =
    typeof attributes.ending_key === "string"
      ? attributes.ending_key.trim()
      : "";

  if (startingKey && endingKey && startingKey !== endingKey) {
    return `${startingKey} -> ${endingKey}`;
  }

  return startingKey || endingKey;
}

export function normalizeSongCatalogEntry(
  resource: PCResource
): SongCatalogEntry {
  const song = resource as RawSong;
  return {
    id: song.id,
    title: toText(song.attributes.title),
    author: toText(song.attributes.author),
    themes: toText(song.attributes.themes),
    hidden: Boolean(song.attributes.hidden),
    lastScheduledAt: toDate(song.attributes.last_scheduled_at),
  };
}

export function normalizePlanItemSong(
  resource: PCResource | undefined
): PlanItemSong | null {
  if (!resource) return null;
  const song = normalizeSongCatalogEntry(resource);
  return {
    id: song.id,
    title: song.title,
    author: song.author,
    themes: song.themes,
    lastScheduledAt: song.lastScheduledAt,
  };
}

export function normalizeArrangementOption(
  resource: PCResource,
  included: PCResource[]
): ArrangementOption {
  const arrangement = resource as RawArrangement;
  const keys = included
    .filter((item) => item.type === "Key")
    .map((item) => normalizeKeyOption(item));

  return {
    id: arrangement.id,
    name: toText(arrangement.attributes.name),
    sequence: toStringArray(arrangement.attributes.sequence),
    length: toNumberOrNull(arrangement.attributes.length),
    archived: Boolean(arrangement.attributes.archived_at),
    keys,
  };
}

export function normalizePlanItemArrangement(
  resource: PCResource | undefined
): PlanItemArrangement | null {
  if (!resource) return null;
  const arrangement = resource as RawArrangement;
  return {
    id: arrangement.id,
    name: toText(arrangement.attributes.name),
    sequence: toStringArray(arrangement.attributes.sequence),
    length: toNumberOrNull(arrangement.attributes.length),
    archivedAt: toDate(arrangement.attributes.archived_at),
  };
}

export function normalizeKeyOption(resource: PCResource): KeyOption {
  const key = resource as RawKey;
  return {
    id: key.id,
    name: getKeyDisplayName(key.attributes),
    startingKey:
      typeof key.attributes.starting_key === "string"
        ? key.attributes.starting_key
        : null,
    endingKey:
      typeof key.attributes.ending_key === "string"
        ? key.attributes.ending_key
        : null,
  };
}

export function normalizePlanItemKey(
  resource: PCResource | undefined
): PlanItemKey | null {
  if (!resource) return null;
  return normalizeKeyOption(resource);
}

export function normalizeLayoutOption(
  resource: PCResource | undefined
): LayoutOption | null {
  if (!resource) return null;
  const attributes = resource.attributes as Record<string, unknown>;
  const name =
    (typeof attributes.name === "string" && attributes.name) ||
    (typeof attributes.title === "string" && attributes.title) ||
    "Selected layout";

  return {
    id: resource.id,
    name,
  };
}

export function normalizePlanItem(
  resource: PCResource,
  included: PCResource[]
): PlanItem {
  const item = resource as RawItem;
  const songId =
    !Array.isArray(item.relationships?.song?.data) &&
    item.relationships?.song?.data
      ? item.relationships.song.data.id
      : null;
  const arrangementId =
    !Array.isArray(item.relationships?.arrangement?.data) &&
    item.relationships?.arrangement?.data
      ? item.relationships.arrangement.data.id
      : null;
  const keyId =
    !Array.isArray(item.relationships?.key?.data) &&
    item.relationships?.key?.data
      ? item.relationships.key.data.id
      : null;
  const layoutRelationship =
    !Array.isArray(item.relationships?.selected_layout?.data) &&
    item.relationships?.selected_layout?.data
      ? item.relationships.selected_layout.data
      : null;

  const song = songId
    ? normalizePlanItemSong(findIncluded(included, "Song", songId))
    : null;
  const arrangement = arrangementId
    ? normalizePlanItemArrangement(
        findIncluded(included, "Arrangement", arrangementId)
      )
    : null;
  const key = keyId
    ? normalizePlanItemKey(findIncluded(included, "Key", keyId))
    : null;
  const includedLayout = layoutRelationship
    ? normalizeLayoutOption(
        findIncluded(included, "Layout", layoutRelationship.id)
      )
    : null;
  const layout =
    includedLayout ??
    (layoutRelationship
      ? { id: layoutRelationship.id, name: "Selected layout" }
      : null);

  return {
    id: item.id,
    title: toText(item.attributes.title),
    itemType: toText(item.attributes.item_type) as PlanItemType,
    sequence:
      typeof item.attributes.sequence === "number"
        ? item.attributes.sequence
        : 0,
    servicePosition: (toText(item.attributes.service_position) ||
      "during") as PlanItemServicePosition,
    length: toNumberOrNull(item.attributes.length),
    description: toText(item.attributes.description),
    htmlDetails: toText(item.attributes.html_details),
    customArrangementSequence: toStringArray(
      item.attributes.custom_arrangement_sequence
    ),
    song,
    arrangement,
    key,
    layout,
  };
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function scoreSongSearch(
  entry: SongCatalogEntry,
  query: string
): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const title = normalizeSearchText(entry.title);
  const author = normalizeSearchText(entry.author);
  const themes = normalizeSearchText(entry.themes);
  const haystack = `${title} ${author} ${themes}`.trim();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  let score = 0;
  if (title === normalizedQuery) score += 1000;
  if (title.startsWith(normalizedQuery)) score += 700;
  if (title.includes(normalizedQuery)) score += 500;
  if (author.startsWith(normalizedQuery)) score += 220;
  if (author.includes(normalizedQuery)) score += 140;
  if (themes.includes(normalizedQuery)) score += 120;

  for (const token of tokens) {
    if (title.startsWith(token)) score += 120;
    else if (title.includes(token)) score += 80;
    else if (haystack.includes(token)) score += 35;
  }

  if (entry.lastScheduledAt) {
    const ageMs = Date.now() - entry.lastScheduledAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    if (ageDays < 180) score += 20;
  }

  return score;
}
