import { ensureRequestIsOpen } from "@pcobooster/api/application/context";
import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import {
  PlanningCenterAccess,
  withPlanningCenterFaults,
} from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterRequestAccess } from "@pcobooster/api/application/planning-center-access";
import {
  commitCreatePlanItem,
  prepareCreatePlanItem,
} from "@pcobooster/api/modules/planning-center/create-plan-item";
import type { PreparedCreatePlanItem } from "@pcobooster/api/modules/planning-center/create-plan-item";
import { deletePlanItem } from "@pcobooster/api/modules/planning-center/delete-plan-item";
import { getPlanItems } from "@pcobooster/api/modules/planning-center/get-plan-items";
import { getSongOptions } from "@pcobooster/api/modules/planning-center/get-song-options";
import type { LoadSongOptions } from "@pcobooster/api/modules/planning-center/plan-item-payload";
import { updatePlanPersonTimes } from "@pcobooster/api/modules/planning-center/plan-person-times";
import {
  createPlanTime,
  deletePlanTime,
  getPlanTimes,
  updatePlanTime,
} from "@pcobooster/api/modules/planning-center/plan-times";
import type { PlanTimeDependencies } from "@pcobooster/api/modules/planning-center/plan-times";
import { reorderPlanItems } from "@pcobooster/api/modules/planning-center/reorder-plan-items";
import { searchSongs } from "@pcobooster/api/modules/planning-center/search-songs";
import {
  commitUpdatePlanItem,
  prepareUpdatePlanItem,
} from "@pcobooster/api/modules/planning-center/update-plan-item";
import type { PreparedUpdatePlanItem } from "@pcobooster/api/modules/planning-center/update-plan-item";
import { Server } from "@pcobooster/api/server";
import type {
  PlanItemsCreateInput,
  PlanItemsDeleteInput,
  PlanItemsListInput,
  PlanItemsReorderInput,
  PlanItemsUpdateInput,
} from "@pcobooster/contracts/plan-items";
import type { PlanPeopleUpdateTimesInput } from "@pcobooster/contracts/plan-people";
import type {
  PlanTimesCreateInput,
  PlanTimesDeleteInput,
  PlanTimesListInput,
  PlanTimesUpdateInput,
} from "@pcobooster/contracts/plan-times";
import type {
  SongsOptionsInput,
  SongsSearchInput,
} from "@pcobooster/contracts/songs";
import type {
  PlanItem,
  PlanTime,
  SongCatalogEntry,
  SongOptionSet,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const planTimeDependenciesFor = (
  access: PlanningCenterRequestAccess
): PlanTimeDependencies => ({
  plansService: access.services.plans,
  peopleService: access.services.people,
  catalogService: access.services.catalog,
});

const loadRequestSongOptions =
  (access: PlanningCenterRequestAccess): LoadSongOptions =>
  (songId, serviceTypeId) =>
    getSongOptions(songId, serviceTypeId, access.services.songs);

export const listPlanItems = (
  input: PlanItemsListInput
): Effect.Effect<
  PlanItem[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* listItems() {
    const access = yield* PlanningCenterAccess;
    return yield* getPlanItems(
      input.serviceTypeId,
      input.planId,
      access.services.planItems
    );
  }).pipe(withPlanningCenterFaults);

export const prepareRunSheetItemCreate = (
  input: PlanItemsCreateInput
): Effect.Effect<
  PreparedCreatePlanItem,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* prepareItemCreate() {
    const access = yield* PlanningCenterAccess;
    return yield* prepareCreatePlanItem(
      {
        ...input,
        songId: input.songId ?? undefined,
        arrangementId: input.arrangementId ?? undefined,
        keyId: input.keyId ?? undefined,
        selectedLayoutId: input.selectedLayoutId ?? undefined,
      },
      loadRequestSongOptions(access)
    );
  }).pipe(withPlanningCenterFaults);

/**
 * Commits begin at the provider-write boundary: the transport runs them
 * without request-driven interruption, so an open request is checked first.
 */
export const commitRunSheetItemCreate = (
  prepared: PreparedCreatePlanItem
): Effect.Effect<
  PlanItem,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* commitItemCreate() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    return yield* commitCreatePlanItem(prepared, access.services.planItems);
  }).pipe(withPlanningCenterFaults);

export const prepareRunSheetItemUpdate = (
  input: PlanItemsUpdateInput
): Effect.Effect<
  PreparedUpdatePlanItem,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* prepareItemUpdate() {
    const access = yield* PlanningCenterAccess;
    return yield* prepareUpdatePlanItem(
      {
        ...input,
        songId: input.songId ?? undefined,
        arrangementId: input.arrangementId ?? undefined,
        keyId: input.keyId ?? undefined,
        selectedLayoutId: input.selectedLayoutId ?? undefined,
      },
      loadRequestSongOptions(access)
    );
  }).pipe(withPlanningCenterFaults);

export const commitRunSheetItemUpdate = (
  prepared: PreparedUpdatePlanItem
): Effect.Effect<
  PlanItem,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* commitItemUpdate() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    return yield* commitUpdatePlanItem(prepared, access.services.planItems);
  }).pipe(withPlanningCenterFaults);

export const deleteRunSheetItem = (
  input: PlanItemsDeleteInput
): Effect.Effect<
  { readonly success: true },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* deleteItem() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    yield* deletePlanItem(input.serviceTypeId, input.planId, input.itemId, {
      planItemsService: access.services.planItems,
    });
    return { success: true as const };
  }).pipe(withPlanningCenterFaults);

export const reorderRunSheetItems = (
  input: PlanItemsReorderInput
): Effect.Effect<
  { readonly success: true },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* reorderItems() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    yield* reorderPlanItems(input.serviceTypeId, input.planId, input.sequence, {
      planItemsService: access.services.planItems,
    });
    return { success: true as const };
  }).pipe(withPlanningCenterFaults);

export const listPlanTimes = (
  input: PlanTimesListInput
): Effect.Effect<
  PlanTime[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* listTimes() {
    const access = yield* PlanningCenterAccess;
    return yield* getPlanTimes(
      input.serviceTypeId,
      input.planId,
      planTimeDependenciesFor(access)
    );
  }).pipe(withPlanningCenterFaults);

export const createRunSheetTime = (
  input: PlanTimesCreateInput
): Effect.Effect<
  PlanTime,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* createTime() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    return yield* createPlanTime(input, planTimeDependenciesFor(access));
  }).pipe(withPlanningCenterFaults);

export const updateRunSheetTime = (
  input: PlanTimesUpdateInput
): Effect.Effect<
  PlanTime,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* updateTime() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    return yield* updatePlanTime(input, planTimeDependenciesFor(access));
  }).pipe(withPlanningCenterFaults);

export const deleteRunSheetTime = (
  input: PlanTimesDeleteInput
): Effect.Effect<
  void,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* deleteTime() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    yield* deletePlanTime(input, planTimeDependenciesFor(access));
  }).pipe(withPlanningCenterFaults);

export const updateRunSheetPersonTimes = (
  input: PlanPeopleUpdateTimesInput
): Effect.Effect<
  { readonly ok: true },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* updatePersonTimes() {
    const access = yield* PlanningCenterAccess;
    yield* ensureRequestIsOpen;
    yield* updatePlanPersonTimes(input, {
      peopleService: access.services.people,
    });
    return { ok: true as const };
  }).pipe(withPlanningCenterFaults);

export const searchRunSheetSongs = (
  input: SongsSearchInput
): Effect.Effect<
  SongCatalogEntry[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* searchRunSheetCatalog() {
    const access = yield* PlanningCenterAccess;
    const { moduleReadCaches } = yield* Server;
    return yield* searchSongs(
      access.cacheScope,
      input.query,
      access.services.songs,
      moduleReadCaches.songSearchResults
    );
  }).pipe(withPlanningCenterFaults);

export const getRunSheetSongOptions = (
  input: SongsOptionsInput
): Effect.Effect<
  SongOptionSet,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* readSongOptions() {
    const access = yield* PlanningCenterAccess;
    return yield* getSongOptions(
      input.songId,
      input.serviceTypeId,
      access.services.songs
    );
  }).pipe(withPlanningCenterFaults);
