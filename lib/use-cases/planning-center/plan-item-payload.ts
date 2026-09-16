import type { PlanItemServicePosition } from "@/lib/types";
import { getSongOptions } from "@/lib/use-cases/planning-center/get-song-options";

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

function omitUndefined(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function toOptionalTrimmedText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function resolvePlanItemSongDefaults(
  input: PlanItemPayloadInput
): Promise<PlanItemPayloadInput> {
  let title = input.title?.trim();
  let arrangementId = input.arrangementId ?? undefined;
  let keyId = input.keyId ?? undefined;
  let selectedLayoutId = input.selectedLayoutId ?? undefined;

  if (input.songId && (!arrangementId || !keyId || !title)) {
    const options = await getSongOptions(input.songId, input.serviceTypeId);
    title ||= options.song.title;
    arrangementId ||= options.suggestedArrangementId ?? undefined;
    keyId ||= options.suggestedKeyId ?? undefined;
    selectedLayoutId ||= options.suggestedLayoutId ?? undefined;
  }

  return {
    ...input,
    title,
    arrangementId,
    keyId,
    selectedLayoutId,
  };
}

export function buildPlanItemAttributes(
  input: PlanItemPayloadInput,
  options?: {
    defaultServicePosition?: PlanItemServicePosition;
  }
) {
  return omitUndefined({
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
}
