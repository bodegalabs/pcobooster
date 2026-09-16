import { planningCenterSongsService } from "@/lib/planning-center/services/songs-service";
import type { ArrangementOption, SongOptionSet } from "@/lib/types";
import {
  normalizeArrangementOption,
  normalizeLayoutOption,
  normalizePlanItem,
  normalizeSongCatalogEntry,
} from "@/lib/use-cases/planning-center/plan-items-shared";

function chooseSuggestedArrangement(
  arrangements: ArrangementOption[]
): ArrangementOption | null {
  return (
    arrangements.find((arrangement) => !arrangement.archived) ??
    arrangements[0] ??
    null
  );
}

export async function getSongOptions(
  songId: string,
  serviceTypeId: string
): Promise<SongOptionSet> {
  const [song, arrangementsResponse, lastScheduledItemResponse] =
    await Promise.all([
      planningCenterSongsService.getSong(songId),
      planningCenterSongsService.getSongArrangementsWithKeys(songId),
      planningCenterSongsService.getSongLastScheduledItem(
        songId,
        serviceTypeId
      ),
    ]);

  const arrangements = arrangementsResponse.data.map((arrangement) => {
    const arrangementKeys = arrangementsResponse.included.filter((included) => {
      if (included.type !== "Key") return false;
      const relationship = included.relationships?.arrangement?.data;
      return (
        !Array.isArray(relationship) && relationship?.id === arrangement.id
      );
    });

    return normalizeArrangementOption(arrangement, arrangementKeys);
  });

  const lastScheduledItem = lastScheduledItemResponse.data
    ? normalizePlanItem(
        lastScheduledItemResponse.data,
        lastScheduledItemResponse.included
      )
    : null;

  const suggestedArrangement =
    (lastScheduledItem?.arrangement &&
      arrangements.find(
        (arrangement) => arrangement.id === lastScheduledItem.arrangement?.id
      )) ||
    chooseSuggestedArrangement(arrangements);
  const suggestedKey =
    (lastScheduledItem?.key &&
      suggestedArrangement?.keys.find(
        (key) => key.id === lastScheduledItem.key?.id
      )) ||
    suggestedArrangement?.keys[0] ||
    null;
  const currentLayout =
    lastScheduledItem?.layout ?? normalizeLayoutOption(undefined);

  return {
    song: normalizeSongCatalogEntry(song),
    arrangements,
    layouts: [],
    currentLayout,
    suggestedArrangementId: suggestedArrangement?.id ?? null,
    suggestedKeyId: suggestedKey?.id ?? null,
    suggestedLayoutId: currentLayout?.id ?? null,
    layoutMode: currentLayout ? "existing-only" : "unavailable",
  };
}
