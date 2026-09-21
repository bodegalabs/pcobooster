import type { ApplicationFault } from "@worship-admin/api/application/errors";
import {
  PlanningCenterAccess,
  tryPlanningCenter,
} from "@worship-admin/api/application/planning-center-access";
import type { PlanningCenterRequestAccess } from "@worship-admin/api/application/planning-center-access";
import type {
  PlanItem,
  PlanTime,
  SongCatalogEntry,
  SongOptionSet,
} from "@worship-admin/api/types";
import { createPlanItem } from "@worship-admin/api/use-cases/planning-center/create-plan-item";
import { deletePlanItem } from "@worship-admin/api/use-cases/planning-center/delete-plan-item";
import { invalidatePlanWindowHistory } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";
import { getPlanItems } from "@worship-admin/api/use-cases/planning-center/get-plan-items";
import { getSongOptions } from "@worship-admin/api/use-cases/planning-center/get-song-options";
import { updatePlanPersonTimes } from "@worship-admin/api/use-cases/planning-center/plan-person-times";
import {
  createPlanTime,
  deletePlanTime,
  getPlanTimes,
  updatePlanTime,
} from "@worship-admin/api/use-cases/planning-center/plan-times";
import type { PlanTimeDependencies } from "@worship-admin/api/use-cases/planning-center/plan-times";
import { reorderPlanItems } from "@worship-admin/api/use-cases/planning-center/reorder-plan-items";
import { searchSongs } from "@worship-admin/api/use-cases/planning-center/search-songs";
import { updatePlanItem } from "@worship-admin/api/use-cases/planning-center/update-plan-item";
import type {
  PlanItemsCreateInput,
  PlanItemsDeleteInput,
  PlanItemsListInput,
  PlanItemsReorderInput,
  PlanItemsUpdateInput,
} from "@worship-admin/contracts/plan-items";
import type { PlanPeopleUpdateTimesInput } from "@worship-admin/contracts/plan-people";
import type {
  PlanTimesCreateInput,
  PlanTimesDeleteInput,
  PlanTimesListInput,
  PlanTimesUpdateInput,
} from "@worship-admin/contracts/plan-times";
import type {
  SongsOptionsInput,
  SongsSearchInput,
} from "@worship-admin/contracts/songs";
import { Effect } from "effect";

const planTimeDependenciesFor = (
  access: PlanningCenterRequestAccess
): PlanTimeDependencies => ({
  plansService: access.services.plans,
  peopleService: access.services.people,
  catalogService: access.services.catalog,
});

const invalidateRequestPlanHistory =
  (access: PlanningCenterRequestAccess): (() => void) =>
  () => {
    invalidatePlanWindowHistory(access.cacheScope);
  };

const loadRequestSongOptions =
  (access: PlanningCenterRequestAccess) =>
  async (songId: string, serviceTypeId: string) =>
    await getSongOptions(songId, serviceTypeId, access.services.songs);

export const listPlanItems = (
  input: PlanItemsListInput
): Effect.Effect<PlanItem[], ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* listItems() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await getPlanItems(
          input.serviceTypeId,
          input.planId,
          access.services.planItems
        )
    );
  });

export const createRunSheetItem = (
  input: PlanItemsCreateInput
): Effect.Effect<PlanItem, ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* createItem() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await createPlanItem(
          {
            ...input,
            songId: input.songId ?? undefined,
            arrangementId: input.arrangementId ?? undefined,
            keyId: input.keyId ?? undefined,
            selectedLayoutId: input.selectedLayoutId ?? undefined,
          },
          {
            planItemsService: access.services.planItems,
            loadSongOptions: loadRequestSongOptions(access),
          }
        )
    );
  });

export const updateRunSheetItem = (
  input: PlanItemsUpdateInput
): Effect.Effect<PlanItem, ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* updateItem() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await updatePlanItem(
          {
            ...input,
            songId: input.songId ?? undefined,
            arrangementId: input.arrangementId ?? undefined,
            keyId: input.keyId ?? undefined,
            selectedLayoutId: input.selectedLayoutId ?? undefined,
          },
          {
            planItemsService: access.services.planItems,
            loadSongOptions: loadRequestSongOptions(access),
          }
        )
    );
  });

export const deleteRunSheetItem = (
  input: PlanItemsDeleteInput
): Effect.Effect<
  { readonly success: true },
  ApplicationFault,
  PlanningCenterAccess
> =>
  Effect.gen(function* deleteItem() {
    const access = yield* PlanningCenterAccess;
    yield* tryPlanningCenter(async () => {
      await deletePlanItem(input.serviceTypeId, input.planId, input.itemId, {
        planItemsService: access.services.planItems,
      });
    });
    return { success: true as const };
  });

export const reorderRunSheetItems = (
  input: PlanItemsReorderInput
): Effect.Effect<
  { readonly success: true },
  ApplicationFault,
  PlanningCenterAccess
> =>
  Effect.gen(function* reorderItems() {
    const access = yield* PlanningCenterAccess;
    yield* tryPlanningCenter(async () => {
      await reorderPlanItems(
        input.serviceTypeId,
        input.planId,
        input.sequence,
        { planItemsService: access.services.planItems }
      );
    });
    return { success: true as const };
  });

export const listPlanTimes = (
  input: PlanTimesListInput
): Effect.Effect<PlanTime[], ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* listTimes() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await getPlanTimes(
          input.serviceTypeId,
          input.planId,
          planTimeDependenciesFor(access)
        )
    );
  });

export const createRunSheetTime = (
  input: PlanTimesCreateInput
): Effect.Effect<PlanTime, ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* createTime() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await createPlanTime(
          input,
          invalidateRequestPlanHistory(access),
          planTimeDependenciesFor(access)
        )
    );
  });

export const updateRunSheetTime = (
  input: PlanTimesUpdateInput
): Effect.Effect<PlanTime, ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* updateTime() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await updatePlanTime(
          input,
          invalidateRequestPlanHistory(access),
          planTimeDependenciesFor(access)
        )
    );
  });

export const deleteRunSheetTime = (
  input: PlanTimesDeleteInput
): Effect.Effect<void, ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* deleteTime() {
    const access = yield* PlanningCenterAccess;
    yield* tryPlanningCenter(async () => {
      await deletePlanTime(
        input,
        invalidateRequestPlanHistory(access),
        planTimeDependenciesFor(access)
      );
    });
  });

export const updateRunSheetPersonTimes = (
  input: PlanPeopleUpdateTimesInput
): Effect.Effect<
  { readonly ok: true },
  ApplicationFault,
  PlanningCenterAccess
> =>
  Effect.gen(function* updatePersonTimes() {
    const access = yield* PlanningCenterAccess;
    yield* tryPlanningCenter(
      async () =>
        await updatePlanPersonTimes(input, {
          peopleService: access.services.people,
          invalidateHistory: invalidatePlanWindowHistory,
        })
    );
    return { ok: true as const };
  });

export const searchRunSheetSongs = (
  input: SongsSearchInput
): Effect.Effect<SongCatalogEntry[], ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* searchRunSheetCatalog() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await searchSongs(
          access.cacheScope,
          input.serviceTypeId,
          input.query,
          access.services.songs
        )
    );
  });

export const getRunSheetSongOptions = (
  input: SongsOptionsInput
): Effect.Effect<SongOptionSet, ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* readSongOptions() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await getSongOptions(
          input.songId,
          input.serviceTypeId,
          access.services.songs
        )
    );
  });
