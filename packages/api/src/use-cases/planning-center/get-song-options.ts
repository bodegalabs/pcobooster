import { planningCenterSongsService } from "@worship-admin/api/planning-center/services/songs-service";
import type { PlanningCenterSongsService } from "@worship-admin/api/planning-center/services/songs-service";
import type {
  ArrangementOption,
  SongOptionSet,
} from "@worship-admin/api/types";
import {
  normalizeArrangementOption,
  normalizePlanItem,
  normalizeSongCatalogEntry,
} from "@worship-admin/api/use-cases/planning-center/plan-items-shared";

const chooseSuggestedArrangement = (
  arrangements: ArrangementOption[]
): ArrangementOption | null =>
  arrangements.find((arrangement) => !arrangement.archived) ??
  arrangements[0] ??
  null;

export interface SongOptionsReader {
  getSong: PlanningCenterSongsService["getSong"];
  getSongArrangementsWithKeys: PlanningCenterSongsService["getSongArrangementsWithKeys"];
  getSongLastScheduledItem: PlanningCenterSongsService["getSongLastScheduledItem"];
}

const normalizeArrangements = (
  response: Awaited<
    ReturnType<SongOptionsReader["getSongArrangementsWithKeys"]>
  >
): ArrangementOption[] =>
  response.data.map((arrangement) => {
    const arrangementKeys = response.included.filter((included) => {
      if (included.type !== "Key") {
        return false;
      }
      const relationship = included.relationships?.arrangement?.data;
      return (
        !Array.isArray(relationship) && relationship?.id === arrangement.id
      );
    });
    return normalizeArrangementOption(arrangement, arrangementKeys);
  });

const getSuggestedKeyId = (
  arrangement: ArrangementOption | null,
  lastScheduledKeyId: string | undefined
): string | null => {
  const lastScheduledKey =
    lastScheduledKeyId === undefined
      ? undefined
      : arrangement?.keys.find((key) => key.id === lastScheduledKeyId);
  return (lastScheduledKey ?? arrangement?.keys[0])?.id ?? null;
};

export const getSongOptions = async (
  songId: string,
  serviceTypeId: string,
  songsReader: SongOptionsReader = planningCenterSongsService
): Promise<SongOptionSet> => {
  const [song, arrangementsResponse, lastScheduledItemResponse] =
    await Promise.all([
      songsReader.getSong(songId),
      songsReader.getSongArrangementsWithKeys(songId),
      songsReader.getSongLastScheduledItem(songId, serviceTypeId),
    ]);

  const arrangements = normalizeArrangements(arrangementsResponse);

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
      )) ??
    chooseSuggestedArrangement(arrangements);
  const suggestedKeyId = getSuggestedKeyId(
    suggestedArrangement,
    lastScheduledItem?.key?.id
  );
  const currentLayout = lastScheduledItem?.layout ?? null;

  return {
    song: normalizeSongCatalogEntry(song),
    arrangements,
    layouts: [],
    currentLayout,
    suggestedArrangementId: suggestedArrangement?.id ?? null,
    suggestedKeyId,
    suggestedLayoutId: currentLayout?.id ?? null,
    layoutMode: currentLayout ? "existing-only" : "unavailable",
  };
};
