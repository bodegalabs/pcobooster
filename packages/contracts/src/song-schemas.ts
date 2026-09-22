import { layoutOptionSchema } from "@pcobooster/contracts/plan-item-schemas";
import { z } from "zod";

export const songCatalogEntrySchema = z.object({
  lastScheduledAt: z.date().nullable(),
  id: z.string(),
  title: z.string(),
  author: z.string(),
  themes: z.string(),
  hidden: z.boolean(),
  matchScore: z.number().optional(),
});

export const keyOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  startingKey: z.string().nullable(),
  endingKey: z.string().nullable(),
});

export const arrangementOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  sequence: z.array(z.string()),
  length: z.number().nullable(),
  archived: z.boolean(),
  keys: z.array(keyOptionSchema),
});

export const songOptionSetSchema = z.object({
  song: songCatalogEntrySchema,
  arrangements: z.array(arrangementOptionSchema),
  layouts: z.array(layoutOptionSchema),
  currentLayout: layoutOptionSchema.nullable(),
  suggestedArrangementId: z.string().nullable(),
  suggestedKeyId: z.string().nullable(),
  suggestedLayoutId: z.string().nullable(),
  layoutMode: z.enum(["unavailable", "existing-only", "editable"]),
});

export type SongCatalogEntry = z.output<typeof songCatalogEntrySchema>;
export type KeyOption = z.output<typeof keyOptionSchema>;
export type ArrangementOption = z.output<typeof arrangementOptionSchema>;
export type SongOptionSet = z.output<typeof songOptionSetSchema>;
