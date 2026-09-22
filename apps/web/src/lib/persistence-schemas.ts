import type {
  PersonWithAvailability,
  Plan,
} from "@pcobooster/planning-center-models/types";
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

const persistedBlockoutSchema = z.object({
  id: z.string(),
  reason: z.string(),
  startsAt: hydratedDateSchema,
  endsAt: hydratedDateSchema,
  description: z.string(),
  share: z.boolean(),
  timeZone: z.string().nullable().optional(),
});

const persistedScheduleFrequencySchema = z.object({
  recentServedDays: z.number(),
  last60Days: z.number(),
  last90Days: z.number(),
  lastServedDate: hydratedDateSchema.optional(),
  totalServed: z.number(),
  recentRehearsalOnlyDays: z.number(),
  rehearsalLast60Days: z.number(),
  rehearsalLast90Days: z.number(),
  lastRehearsalDate: hydratedDateSchema.optional(),
  totalRehearsals: z.number(),
  upcomingServices: z.number(),
  nextUpcomingDate: hydratedDateSchema.optional(),
  upcomingRehearsals: z.number(),
  nextRehearsalDate: hydratedDateSchema.optional(),
});

const persistedServiceHistoryItemSchema = z.object({
  id: z.string(),
  sourceScheduleId: z.string(),
  date: hydratedDateSchema,
  teamPositionName: z.string(),
  teamName: z.string().optional(),
  serviceTypeName: z.string().optional(),
  planTitle: z.string().optional(),
  status: z.string(),
  timeType: z.enum(["service", "rehearsal", "other"]).optional(),
});

const filledPositionPersonSchema = z.object({
  id: z.string(),
  planPersonId: z.string(),
  personId: z.string().nullable().optional(),
  name: z.string(),
  status: z.enum(["pending", "confirmed"]),
  rawStatus: z.string(),
  photoThumbnailUrl: z.string().nullable().optional(),
  assignedTimeIds: z.array(z.string()).optional(),
  serviceTimeIds: z.array(z.string()).optional(),
});

const teamPositionSchema = z.object({
  id: z.string(),
  name: z.string(),
  teamId: z.string(),
  teamName: z.string().optional(),
  source: z
    .enum(["team_position", "needed_position", "plan_member", "custom"])
    .optional(),
  neededPositionId: z.string().optional(),
  timeId: z.string().nullable().optional(),
  timePreferenceOptionId: z.string().nullable().optional(),
  neededCount: z.number().optional(),
  filledPendingCount: z.number().optional(),
  filledConfirmedCount: z.number().optional(),
  filledPeople: z.array(filledPositionPersonSchema).optional(),
});

export const persistedPersonWithAvailabilitySchema = z.object({
  availability: z.enum(["available", "blocked", "unknown"]).optional(),
  frequency: persistedScheduleFrequencySchema.optional(),
  blockouts: z.array(persistedBlockoutSchema).optional(),
  serviceHistory: z.array(persistedServiceHistoryItemSchema).optional(),
  isBlockedForDate: z.boolean().optional(),
  isScheduledForSelectedPlanPosition: z.boolean().optional(),
  isConfirmedForSelectedPlanPosition: z.boolean().optional(),
  isDeclinedForSelectedPlanPosition: z.boolean().optional(),
  selectedPlanDeclineReason: z.string().nullable().optional(),
  selectedPlanAssignmentLabels: z.array(z.string()).optional(),
  scheduledPlanPersonId: z.string().optional(),
  recommendationScore: z.number().optional(),
  recommendationReasoning: z.array(z.string()).optional(),
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  photoUrl: z.string().nullable(),
  photoThumbnailUrl: z.string().nullable(),
  archived: z.boolean(),
  positions: z.array(teamPositionSchema),
}) satisfies z.ZodType<PersonWithAvailability>;

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
