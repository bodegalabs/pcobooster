import { z } from "zod";

export const planItemSongSchema = z.object({
  lastScheduledAt: z.date().nullable(),
  id: z.string(),
  title: z.string(),
  author: z.string(),
  themes: z.string(),
});

export const planItemArrangementSchema = z.object({
  archivedAt: z.date().nullable(),
  id: z.string(),
  sequence: z.array(z.string()),
  length: z.number().nullable(),
  name: z.string(),
});

export const planItemTypeSchema = z.enum(["song", "header", "item", "media"]);

export const planItemServicePositionSchema = z.enum(["pre", "during", "post"]);

export const planItemKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  startingKey: z.string().nullable(),
  endingKey: z.string().nullable(),
});

export const layoutOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const planItemSchema = z.object({
  song: planItemSongSchema.nullable(),
  arrangement: planItemArrangementSchema.nullable(),
  id: z.string(),
  title: z.string(),
  itemType: planItemTypeSchema,
  sequence: z.number(),
  servicePosition: planItemServicePositionSchema,
  length: z.number().nullable(),
  description: z.string(),
  htmlDetails: z.string(),
  customArrangementSequence: z.array(z.string()),
  key: planItemKeySchema.nullable(),
  layout: layoutOptionSchema.nullable(),
});

export type PlanItemSong = z.output<typeof planItemSongSchema>;
export type PlanItemArrangement = z.output<typeof planItemArrangementSchema>;
export type PlanItemType = z.output<typeof planItemTypeSchema>;
export type PlanItemServicePosition = z.output<
  typeof planItemServicePositionSchema
>;
export type PlanItemKey = z.output<typeof planItemKeySchema>;
export type LayoutOption = z.output<typeof layoutOptionSchema>;
export type PlanItem = z.output<typeof planItemSchema>;
