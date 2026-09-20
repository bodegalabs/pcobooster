import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import type {
  JsonObject,
  JsonValue,
} from "@worship-admin/planning-center-models/json";
import type {
  PlanItemServicePosition,
  SongOptionSet,
} from "@worship-admin/planning-center-models/types";

export interface PlanItemPayloadInput {
  serviceTypeId: string;
  title?: string;
  itemType?: "header" | "item";
  servicePosition?: PlanItemServicePosition;
  length?: number | null;
  description?: string;
  htmlDetails?: string;
  songId?: string;
  arrangementId?: string | null;
  keyId?: string | null;
  selectedLayoutId?: string | null;
  customArrangementSequence?: string[];
}

export type LoadSongOptions = (
  songId: string,
  serviceTypeId: string
) => Promise<SongOptionSet>;

const omitUndefined = (
  record: Record<string, JsonValue | undefined>
): JsonObject => {
  const attributes: JsonObject = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      attributes[key] = value;
    }
  }
  return attributes;
};

const toOptionalTrimmedText = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ?? undefined;
};

export const resolvePlanItemSongDefaults = async (
  input: PlanItemPayloadInput,
  loadSongOptions: LoadSongOptions
): Promise<PlanItemPayloadInput> => {
  let title = input.title?.trim();
  let arrangementId = input.arrangementId ?? undefined;
  let keyId = input.keyId ?? undefined;
  let selectedLayoutId = input.selectedLayoutId ?? undefined;

  if (
    isNonEmptyString(input.songId) &&
    (!isNonEmptyString(arrangementId) ||
      !isNonEmptyString(keyId) ||
      !isNonEmptyString(title))
  ) {
    const options = await loadSongOptions(input.songId, input.serviceTypeId);
    if (title === "" || title === undefined) {
      const { title: songTitle } = options.song;
      title = songTitle;
    }
    arrangementId ??= options.suggestedArrangementId ?? undefined;
    keyId ??= options.suggestedKeyId ?? undefined;
    selectedLayoutId ??= options.suggestedLayoutId ?? undefined;
  }

  return {
    ...input,
    title,
    arrangementId,
    keyId,
    selectedLayoutId,
  };
};

export const buildPlanItemAttributes = (
  input: PlanItemPayloadInput,
  options?: {
    defaultServicePosition?: PlanItemServicePosition;
  }
) =>
  omitUndefined({
    title: toOptionalTrimmedText(input.title),
    item_type: input.itemType === "header" ? "header" : undefined,
    service_position: input.servicePosition ?? options?.defaultServicePosition,
    length: input.length === undefined ? undefined : input.length,
    description: toOptionalTrimmedText(input.description),
    html_details: toOptionalTrimmedText(input.htmlDetails),
    song_id: input.songId,
    arrangement_id: input.arrangementId ?? undefined,
    key_id: input.keyId ?? undefined,
    selected_layout_id: input.selectedLayoutId ?? undefined,
    custom_arrangement_sequence:
      input.customArrangementSequence &&
      input.customArrangementSequence.length > 0
        ? input.customArrangementSequence
        : undefined,
  });
