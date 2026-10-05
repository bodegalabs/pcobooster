import { layoutOptionSchema } from "@pcobooster/contracts/plan-item-schemas";
import { Schema, Struct } from "effect";

export const songCatalogEntrySchema = Schema.Struct({
  lastScheduledAt: Schema.NullOr(Schema.Date),
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
  themes: Schema.String,
  hidden: Schema.Boolean,
  matchScore: Schema.optional(Schema.Finite),
}).mapFields(Struct.map(Schema.mutableKey));

export const keyOptionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  startingKey: Schema.NullOr(Schema.String),
  endingKey: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const arrangementOptionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  sequence: Schema.mutable(Schema.Array(Schema.String)),
  length: Schema.NullOr(Schema.Finite),
  bpm: Schema.NullOr(Schema.Finite),
  meter: Schema.NullOr(Schema.String),
  archived: Schema.Boolean,
  keys: Schema.mutable(Schema.Array(keyOptionSchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export const songOptionSetSchema = Schema.Struct({
  song: songCatalogEntrySchema,
  arrangements: Schema.mutable(Schema.Array(arrangementOptionSchema)),
  layouts: Schema.mutable(Schema.Array(layoutOptionSchema)),
  currentLayout: Schema.NullOr(layoutOptionSchema),
  suggestedArrangementId: Schema.NullOr(Schema.String),
  suggestedKeyId: Schema.NullOr(Schema.String),
  suggestedLayoutId: Schema.NullOr(Schema.String),
  layoutMode: Schema.Literals(["unavailable", "existing-only", "editable"]),
}).mapFields(Struct.map(Schema.mutableKey));

export type SongCatalogEntry = typeof songCatalogEntrySchema.Type;

export type KeyOption = typeof keyOptionSchema.Type;

export type ArrangementOption = typeof arrangementOptionSchema.Type;

export type SongOptionSet = typeof songOptionSetSchema.Type;
