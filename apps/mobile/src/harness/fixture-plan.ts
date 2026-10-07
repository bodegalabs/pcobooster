import { planItemSchema } from "@pcobooster/contracts/http/plan-item-schemas";
import {
  planItemsCreateInputSchema,
  planItemsUpdateInputSchema,
  planItemsDeleteInputSchema,
  planItemsReorderInputSchema,
  planItemsListInputSchema,
} from "@pcobooster/contracts/http/plan-items";
import { planTimeSchema } from "@pcobooster/contracts/http/plan-time-schemas";
import {
  planTimesCreateInputSchema,
  planTimesUpdateInputSchema,
  planTimesDeleteInputSchema,
} from "@pcobooster/contracts/http/plan-times";
import { songOptionSetSchema } from "@pcobooster/contracts/http/song-schemas";
import {
  createOptimisticBasicPlanItem,
  insertPlanItem,
  removePlanItem,
  replacePlanItem,
} from "@pcobooster/planning-center-models/plan-item-order";
import type {
  PlanItem,
  PlanTime,
} from "@pcobooster/planning-center-models/types";
import { Schema } from "effect";
import type { Json } from "effect/Schema";

const itemsCodec = Schema.toCodecJson(
  Schema.mutable(Schema.Array(planItemSchema))
);
const timesCodec = Schema.toCodecJson(
  Schema.mutable(Schema.Array(planTimeSchema))
);
const itemCodec = Schema.toCodecJson(planItemSchema);
const timeCodec = Schema.toCodecJson(planTimeSchema);
const optionsCodec = Schema.toCodecJson(songOptionSetSchema);
const toJson = Schema.decodeUnknownSync(Schema.Json);

interface FixtureContext {
  payload: Json;
  ids: typeof planItemsListInputSchema.Type;
  scope: string;
  items: PlanItem[];
  planTimes: PlanTime[];
  plans: Map<string, PlanItem[]>;
  times: Map<string, PlanTime[]>;
  serial: number;
  seed: (tag: string, payload: Json) => Json;
}
const updatedEnd = (
  value: string | null | undefined,
  previous: Date | null
): Date | null => {
  if (value === undefined) {
    return previous;
  }
  return value === null ? null : new Date(value);
};
const createItem = (context: FixtureContext): Json => {
  const { payload, ids, scope, items, plans, serial, seed } = context;

  const input = Schema.decodeUnknownSync(
    Schema.toCodecJson(planItemsCreateInputSchema)
  )(payload);
  const basic = createOptimisticBasicPlanItem(
    `fixture-item-${serial}`,
    input.itemType ?? "item",
    items.length + 1
  );
  let item: PlanItem = {
    ...basic,
    title: input.title ?? basic.title,
    description: input.description ?? "",
    length: input.length ?? null,
    servicePosition: input.servicePosition ?? "during",
  };
  if (input.songId !== undefined && input.songId !== null) {
    const options = Schema.decodeUnknownSync(optionsCodec)(
      seed("songs.options", {
        serviceTypeId: ids.serviceTypeId,
        songId: input.songId,
      })
    );
    const arrangement = options.arrangements.find(
      (value) =>
        value.id === (input.arrangementId ?? options.suggestedArrangementId)
    );
    item = {
      ...item,
      itemType: "song",
      song: options.song,
      title: options.song.title,
      arrangement:
        arrangement === undefined ? null : { ...arrangement, archivedAt: null },
      key:
        arrangement?.keys.find(
          (value) => value.id === (input.keyId ?? options.suggestedKeyId)
        ) ?? null,
      layout:
        options.layouts.find(
          (value) =>
            value.id === (input.selectedLayoutId ?? options.suggestedLayoutId)
        ) ?? null,
      length: input.length ?? arrangement?.length ?? null,
    };
  }
  plans.set(scope, insertPlanItem(items, item));
  return toJson(Schema.encodeSync(itemCodec)(item));
};

const updateItem = (context: FixtureContext): Json => {
  const { payload, ids, scope, items, plans, seed } = context;

  const input = Schema.decodeUnknownSync(
    Schema.toCodecJson(planItemsUpdateInputSchema)
  )(payload);
  const item = items.find((value) => value.id === input.itemId);
  if (item === undefined) {
    throw new Error("Fixture item is missing.");
  }
  let updated: PlanItem = {
    ...item,
    title: input.title ?? item.title,
    description: input.description ?? item.description,
    servicePosition: input.servicePosition ?? item.servicePosition,
    length: input.length === undefined ? item.length : input.length,
    customArrangementSequence:
      input.customArrangementSequence ?? item.customArrangementSequence,
  };
  if (
    item.song !== null &&
    (input.arrangementId !== undefined || input.keyId !== undefined)
  ) {
    const options = Schema.decodeUnknownSync(optionsCodec)(
      seed("songs.options", {
        serviceTypeId: ids.serviceTypeId,
        songId: item.song.id,
      })
    );
    const arrangement = options.arrangements.find(
      (value) =>
        value.id ===
        (input.arrangementId === undefined
          ? item.arrangement?.id
          : input.arrangementId)
    );
    updated = {
      ...updated,
      arrangement:
        arrangement === undefined ? null : { ...arrangement, archivedAt: null },
      key:
        arrangement?.keys.find(
          (value) =>
            value.id ===
            (input.keyId === undefined ? item.key?.id : input.keyId)
        ) ?? null,
    };
  }
  plans.set(scope, replacePlanItem(items, updated));
  return toJson(Schema.encodeSync(itemCodec)(updated));
};

const createTime = (context: FixtureContext): Json => {
  const { payload, scope, planTimes, times, serial } = context;

  const input = Schema.decodeUnknownSync(
    Schema.toCodecJson(planTimesCreateInputSchema)
  )(payload);
  const time: PlanTime = {
    id: `fixture-time-${serial}`,
    name: input.name ?? "",
    startsAt: new Date(input.startsAt),
    endsAt:
      input.endsAt === undefined || input.endsAt === null
        ? null
        : new Date(input.endsAt),
    timeType: input.timeType,
    assignedTeamIds: input.assignedTeamIds ?? [],
    assignedPositionIds: input.assignedPositionIds ?? [],
    teamReminders: [],
    splitTeamRehearsalAssignmentIds: [],
  };
  times.set(scope, [...planTimes, time]);
  return toJson(Schema.encodeSync(timeCodec)(time));
};

const updateTime = (context: FixtureContext): Json => {
  const { payload, scope, planTimes, times } = context;

  const input = Schema.decodeUnknownSync(
    Schema.toCodecJson(planTimesUpdateInputSchema)
  )(payload);
  const time = planTimes.find((value) => value.id === input.planTimeId);
  if (time === undefined) {
    throw new Error("Fixture time is missing.");
  }
  const updated: PlanTime = {
    ...time,
    name: input.name ?? time.name,
    timeType: input.timeType ?? time.timeType,
    startsAt:
      input.startsAt === undefined ? time.startsAt : new Date(input.startsAt),
    endsAt: updatedEnd(input.endsAt, time.endsAt),
    assignedTeamIds: input.assignedTeamIds ?? time.assignedTeamIds,
    assignedPositionIds: input.assignedPositionIds ?? time.assignedPositionIds,
  };
  times.set(
    scope,
    planTimes.map((value) => (value.id === time.id ? updated : value))
  );
  return toJson(Schema.encodeSync(timeCodec)(updated));
};
/** Every fixture client owns its plan state; no write makes a network request. */
export const makeFixturePlan = (seed: (tag: string, payload: Json) => Json) => {
  const plans = new Map<string, PlanItem[]>();
  const times = new Map<string, PlanTime[]>();
  let serial = 0;
  const update = (
    tag: string,
    payload: Json,
    fallback: Json,
    account: string
  ): Json => {
    if (!tag.startsWith("planItems.") && !tag.startsWith("planTimes.")) {
      return fallback;
    }
    const ids = Schema.decodeUnknownSync(
      Schema.toCodecJson(planItemsListInputSchema)
    )(payload);
    const scope = `${account}:${ids.serviceTypeId}:${ids.planId}`;
    const items =
      plans.get(scope) ??
      Schema.decodeUnknownSync(itemsCodec)(seed("planItems.list", payload));
    const planTimes =
      times.get(scope) ??
      Schema.decodeUnknownSync(timesCodec)(seed("planTimes.list", payload));
    plans.set(scope, items);
    times.set(scope, planTimes);
    serial += 1;
    if (tag === "planItems.list") {
      return toJson(Schema.encodeSync(itemsCodec)(items));
    }
    if (tag === "planTimes.list") {
      return toJson(Schema.encodeSync(timesCodec)(planTimes));
    }
    if (tag === "planItems.create") {
      return createItem({
        payload,
        ids,
        scope,
        items,
        planTimes,
        plans,
        times,
        serial,
        seed,
      });
    }
    if (tag === "planItems.update") {
      return updateItem({
        payload,
        ids,
        scope,
        items,
        planTimes,
        plans,
        times,
        serial,
        seed,
      });
    }
    if (tag === "planItems.delete") {
      const input = Schema.decodeUnknownSync(
        Schema.toCodecJson(planItemsDeleteInputSchema)
      )(payload);
      plans.set(scope, removePlanItem(items, input.itemId));
      return { success: true };
    }
    if (tag === "planItems.reorder") {
      const input = Schema.decodeUnknownSync(
        Schema.toCodecJson(planItemsReorderInputSchema)
      )(payload);
      const order = new Map(input.sequence.map((id, index) => [id, index + 1]));
      plans.set(
        scope,
        items
          .map((item) => ({
            ...item,
            sequence: order.get(item.id) ?? item.sequence,
          }))
          .toSorted((a, b) => a.sequence - b.sequence)
      );
      return { success: true };
    }
    if (tag === "planTimes.create") {
      return createTime({
        payload,
        ids,
        scope,
        items,
        planTimes,
        plans,
        times,
        serial,
        seed,
      });
    }
    if (tag === "planTimes.update") {
      return updateTime({
        payload,
        ids,
        scope,
        items,
        planTimes,
        plans,
        times,
        serial,
        seed,
      });
    }
    const input = Schema.decodeUnknownSync(
      Schema.toCodecJson(planTimesDeleteInputSchema)
    )(payload);
    times.set(
      scope,
      planTimes.filter((time) => time.id !== input.planTimeId)
    );
    return null;
  };
  return update;
};
