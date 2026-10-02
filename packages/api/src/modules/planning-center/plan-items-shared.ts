import { findIncluded } from "@pcobooster/api/planning-center/utils";
import {
  isNonEmptyString,
  isNumber,
  isString,
} from "@pcobooster/planning-center-models/json";
import type {
  JsonObject,
  JsonValue,
} from "@pcobooster/planning-center-models/json";
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
  PCRelationship,
  SongCatalogEntry,
} from "@pcobooster/planning-center-models/types";

const toDate = (value: JsonValue | undefined): Date | null => {
  if (!isString(value) || !value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toNumberOrNull = (value: JsonValue | undefined): number | null =>
  isNumber(value) && Number.isFinite(value) ? value : null;

const toStringArray = (value: JsonValue | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => isString(item) && item.trim().length > 0
  );
};

const toText = (value: JsonValue | undefined): string =>
  isString(value) ? value : "";

const getKeyDisplayName = (attributes: JsonObject): string => {
  const name = toText(attributes.name).trim();
  if (name) {
    return name;
  }

  const startingKey = isString(attributes.starting_key)
    ? attributes.starting_key.trim()
    : "";
  const endingKey = isString(attributes.ending_key)
    ? attributes.ending_key.trim()
    : "";

  if (startingKey && endingKey && startingKey !== endingKey) {
    return `${startingKey} -> ${endingKey}`;
  }

  return startingKey || endingKey;
};

export const normalizeSongCatalogEntry = (
  resource: PCResource
): SongCatalogEntry => {
  const { attributes } = resource;
  return {
    id: resource.id,
    title: toText(attributes.title),
    author: toText(attributes.author),
    themes: toText(attributes.themes),
    hidden: attributes.hidden === true,
    lastScheduledAt: toDate(attributes.last_scheduled_at),
  };
};

export const normalizePlanItemSong = (
  resource: PCResource | undefined
): PlanItemSong | null => {
  if (!resource) {
    return null;
  }
  const song = normalizeSongCatalogEntry(resource);
  return {
    id: song.id,
    title: song.title,
    author: song.author,
    themes: song.themes,
    lastScheduledAt: song.lastScheduledAt,
  };
};

export const normalizePlanItemArrangement = (
  resource: PCResource | undefined
): PlanItemArrangement | null => {
  if (!resource) {
    return null;
  }
  const { attributes } = resource;
  return {
    id: resource.id,
    name: toText(attributes.name),
    sequence: toStringArray(attributes.sequence),
    length: toNumberOrNull(attributes.length),
    archivedAt: toDate(attributes.archived_at),
  };
};

export const normalizeKeyOption = (resource: PCResource): KeyOption => {
  const { attributes } = resource;
  return {
    id: resource.id,
    name: getKeyDisplayName(attributes),
    startingKey: isString(attributes.starting_key)
      ? attributes.starting_key
      : null,
    endingKey: isString(attributes.ending_key) ? attributes.ending_key : null,
  };
};

export const normalizeArrangementOption = (
  resource: PCResource,
  included: PCResource[]
): ArrangementOption => {
  const { attributes } = resource;
  const keys: KeyOption[] = [];
  for (const item of included) {
    if (item.type === "Key") {
      keys.push(normalizeKeyOption(item));
    }
  }

  const meter = toText(attributes.meter).trim();
  return {
    id: resource.id,
    name: toText(attributes.name),
    sequence: toStringArray(attributes.sequence),
    length: toNumberOrNull(attributes.length),
    bpm: toNumberOrNull(attributes.bpm),
    meter: meter === "" ? null : meter,
    archived: isNonEmptyString(attributes.archived_at),
    keys,
  };
};

export const normalizePlanItemKey = (
  resource: PCResource | undefined
): PlanItemKey | null => {
  if (!resource) {
    return null;
  }
  return normalizeKeyOption(resource);
};

export const normalizeLayoutOption = (
  resource: PCResource | undefined
): LayoutOption | null => {
  if (!resource) {
    return null;
  }
  const { attributes } = resource;
  const name =
    (isString(attributes.name) && attributes.name) ||
    (isString(attributes.title) && attributes.title) ||
    "Selected layout";

  return {
    id: resource.id,
    name,
  };
};

export const getSingleRelationshipId = (
  relationship: PCRelationship | undefined
): string | null => {
  const data = relationship?.data;
  if (Array.isArray(data)) {
    return data[0]?.id ?? null;
  }
  return data?.id ?? null;
};

const readPlanItemType = (value: JsonValue | undefined): PlanItemType => {
  if (value === "song" || value === "header" || value === "media") {
    return value;
  }
  return "item";
};

const readServicePosition = (
  value: JsonValue | undefined
): PlanItemServicePosition => {
  if (value === "pre" || value === "post") {
    return value;
  }
  return "during";
};

export const normalizePlanItem = (
  resource: PCResource,
  included: PCResource[]
): PlanItem => {
  const songId = getSingleRelationshipId(resource.relationships?.song);
  const arrangementId = getSingleRelationshipId(
    resource.relationships?.arrangement
  );
  const keyId = getSingleRelationshipId(resource.relationships?.key);
  const layoutId = getSingleRelationshipId(
    resource.relationships?.selected_layout
  );

  const song = isNonEmptyString(songId)
    ? normalizePlanItemSong(findIncluded(included, "Song", songId))
    : null;
  const arrangement = isNonEmptyString(arrangementId)
    ? normalizePlanItemArrangement(
        findIncluded(included, "Arrangement", arrangementId)
      )
    : null;
  const key = isNonEmptyString(keyId)
    ? normalizePlanItemKey(findIncluded(included, "Key", keyId))
    : null;
  const includedLayout = isNonEmptyString(layoutId)
    ? normalizeLayoutOption(findIncluded(included, "Layout", layoutId))
    : null;
  const layout =
    includedLayout ??
    (isNonEmptyString(layoutId)
      ? { id: layoutId, name: "Selected layout" }
      : null);

  return {
    id: resource.id,
    title: toText(resource.attributes.title),
    itemType: readPlanItemType(resource.attributes.item_type),
    sequence: isNumber(resource.attributes.sequence)
      ? resource.attributes.sequence
      : 0,
    servicePosition: readServicePosition(resource.attributes.service_position),
    length: toNumberOrNull(resource.attributes.length),
    description: toText(resource.attributes.description),
    htmlDetails: toText(resource.attributes.html_details),
    customArrangementSequence: toStringArray(
      resource.attributes.custom_arrangement_sequence
    ),
    song,
    arrangement,
    key,
    layout,
  };
};
