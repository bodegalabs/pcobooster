/** Song answers. */
import { layoutOptionSchema } from "@pcobooster/contracts/http/plan-item-schemas";
import { finiteNumber, mutableArray } from "@pcobooster/contracts/http/schema";
import { Schema } from "effect";

export const songCatalogEntrySchema = Schema.Struct({
  lastScheduledAt: Schema.NullOr(Schema.Date),
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
  themes: Schema.String,
  hidden: Schema.Boolean,
  matchScore: Schema.optional(finiteNumber),
});

export const keyOptionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  startingKey: Schema.NullOr(Schema.String),
  endingKey: Schema.NullOr(Schema.String),
});

export const arrangementOptionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  sequence: mutableArray(Schema.String),
  length: Schema.NullOr(finiteNumber),
  bpm: Schema.NullOr(finiteNumber),
  meter: Schema.NullOr(Schema.String),
  archived: Schema.Boolean,
  keys: mutableArray(keyOptionSchema),
});

export const songOptionSetSchema = Schema.Struct({
  song: songCatalogEntrySchema,
  arrangements: mutableArray(arrangementOptionSchema),
  layouts: mutableArray(layoutOptionSchema),
  currentLayout: Schema.NullOr(layoutOptionSchema),
  suggestedArrangementId: Schema.NullOr(Schema.String),
  suggestedKeyId: Schema.NullOr(Schema.String),
  suggestedLayoutId: Schema.NullOr(Schema.String),
  layoutMode: Schema.Literals(["unavailable", "existing-only", "editable"]),
});

export type SongCatalogEntry = typeof songCatalogEntrySchema.Type;
export type KeyOption = typeof keyOptionSchema.Type;
export type ArrangementOption = typeof arrangementOptionSchema.Type;
export type SongOptionSet = typeof songOptionSetSchema.Type;
