import {
  normalizeArrangementOption,
  normalizePlanItem,
  normalizeSongCatalogEntry,
} from "@pcobooster/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterSongsService } from "@pcobooster/api/planning-center/services/songs-service";
import type {
  ArrangementOption,
  SongOptionSet,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

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
  response: Effect.Success<
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

const toSongOptionSet = (
  song: Effect.Success<ReturnType<SongOptionsReader["getSong"]>>,
  arrangementsResponse: Effect.Success<
    ReturnType<SongOptionsReader["getSongArrangementsWithKeys"]>
  >,
  lastScheduledItemResponse: Effect.Success<
    ReturnType<SongOptionsReader["getSongLastScheduledItem"]>
  >
): SongOptionSet => {
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

export const getSongOptions = (
  songId: string,
  serviceTypeId: string,
  songsReader: SongOptionsReader
): Effect.Effect<SongOptionSet, PlanningCenterError> =>
  Effect.map(
    Effect.all(
      [
        songsReader.getSong(songId),
        songsReader.getSongArrangementsWithKeys(songId),
        songsReader.getSongLastScheduledItem(songId, serviceTypeId),
      ],
      { concurrency: "unbounded" }
    ),
    ([song, arrangementsResponse, lastScheduledItemResponse]) =>
      toSongOptionSet(song, arrangementsResponse, lastScheduledItemResponse)
  );
