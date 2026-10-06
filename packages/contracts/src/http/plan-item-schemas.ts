/** Run-sheet item answers over Effect RPC. Ported from the zod schemas in `../plan-item-schemas.ts`. */
import { finiteNumber, mutableArray } from "@pcobooster/contracts/http/schema";
import { Schema } from "effect";

export const planItemSongSchema = Schema.Struct({
  lastScheduledAt: Schema.NullOr(Schema.Date),
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
  themes: Schema.String,
});

export const planItemArrangementSchema = Schema.Struct({
  archivedAt: Schema.NullOr(Schema.Date),
  id: Schema.String,
  sequence: mutableArray(Schema.String),
  length: Schema.NullOr(finiteNumber),
  name: Schema.String,
});

export const planItemTypeSchema = Schema.Literals([
  "song",
  "header",
  "item",
  "media",
]);

export const planItemServicePositionSchema = Schema.Literals([
  "pre",
  "during",
  "post",
]);

export const planItemKeySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  startingKey: Schema.NullOr(Schema.String),
  endingKey: Schema.NullOr(Schema.String),
});

export const layoutOptionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});

export const planItemSchema = Schema.Struct({
  song: Schema.NullOr(planItemSongSchema),
  arrangement: Schema.NullOr(planItemArrangementSchema),
  id: Schema.String,
  title: Schema.String,
  itemType: planItemTypeSchema,
  sequence: finiteNumber,
  servicePosition: planItemServicePositionSchema,
  length: Schema.NullOr(finiteNumber),
  description: Schema.String,
  htmlDetails: Schema.String,
  customArrangementSequence: mutableArray(Schema.String),
  key: Schema.NullOr(planItemKeySchema),
  layout: Schema.NullOr(layoutOptionSchema),
});
