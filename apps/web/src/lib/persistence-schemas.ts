import type { Plan } from "@pcobooster/planning-center-models/types";
import { z } from "zod";

import type {
  SerializedPlanItem,
  SerializedPlanItemArrangement,
  SerializedPlanItemSong,
} from "@/lib/plan-item-client";
import type {
  SerializedSongCatalogEntry,
  SerializedSongOptionSet,
} from "@/lib/song-catalog-client";

// Browser storage is JSON, while RPC contracts expose native Date values.
// These schemas are the single hydration boundary between those formats.
const serializedDateSchema = z.union([z.string(), z.date()]);
const hydratedDateSchema = serializedDateSchema.pipe(z.coerce.date());

export const persistedPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  seriesTitle: z.string().optional(),
  seriesId: z.string().nullable().optional(),
  planningCenterUrl: z.string().nullable().optional(),
  createdAt: hydratedDateSchema,
  sortDate: hydratedDateSchema.optional(),
}) satisfies z.ZodType<Plan>;

const serializedPlanItemSongSchema = z.object({
  lastScheduledAt: serializedDateSchema.nullable(),
  id: z.string(),
  title: z.string(),
  author: z.string(),
  themes: z.string(),
}) satisfies z.ZodType<SerializedPlanItemSong>;

const serializedPlanItemArrangementSchema = z.object({
  archivedAt: serializedDateSchema.nullable(),
  id: z.string(),
  sequence: z.array(z.string()),
  length: z.number().nullable(),
  name: z.string(),
}) satisfies z.ZodType<SerializedPlanItemArrangement>;

const planItemKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  startingKey: z.string().nullable(),
  endingKey: z.string().nullable(),
});

const layoutOptionSchema = z.object({ id: z.string(), name: z.string() });

export const serializedPlanItemSchema = z.object({
  song: serializedPlanItemSongSchema.nullable(),
  arrangement: serializedPlanItemArrangementSchema.nullable(),
  id: z.string(),
  title: z.string(),
  itemType: z.enum(["song", "header", "item", "media"]),
  sequence: z.number(),
  servicePosition: z.enum(["pre", "during", "post"]),
  length: z.number().nullable(),
  description: z.string(),
  htmlDetails: z.string(),
  customArrangementSequence: z.array(z.string()),
  key: planItemKeySchema.nullable(),
  layout: layoutOptionSchema.nullable(),
}) satisfies z.ZodType<SerializedPlanItem>;

export const serializedSongCatalogEntrySchema = z.object({
  lastScheduledAt: serializedDateSchema.nullable(),
  id: z.string(),
  title: z.string(),
  author: z.string(),
  themes: z.string(),
  hidden: z.boolean(),
  matchScore: z.number().optional(),
}) satisfies z.ZodType<SerializedSongCatalogEntry>;

const keyOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  startingKey: z.string().nullable(),
  endingKey: z.string().nullable(),
});

const arrangementOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  sequence: z.array(z.string()),
  length: z.number().nullable(),
  archived: z.boolean(),
  keys: z.array(keyOptionSchema),
});

export const serializedSongOptionSetSchema = z.object({
  song: serializedSongCatalogEntrySchema,
  arrangements: z.array(arrangementOptionSchema),
  layouts: z.array(layoutOptionSchema),
  currentLayout: layoutOptionSchema.nullable(),
  suggestedArrangementId: z.string().nullable(),
  suggestedKeyId: z.string().nullable(),
  suggestedLayoutId: z.string().nullable(),
  layoutMode: z.enum(["unavailable", "existing-only", "editable"]),
}) satisfies z.ZodType<SerializedSongOptionSet>;
