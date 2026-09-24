// Planning Center API Response Types
import type {
  JsonObject,
  JsonValue,
} from "@pcobooster/planning-center-models/json";

export interface PCApiResponse<T> {
  data: T;
  included?: PCResource[];
  meta?: {
    total_count?: number;
    count?: number;
    next?: { offset: number };
    prev?: { offset: number };
  };
  links?: {
    self?: string;
    next?: string;
    prev?: string;
  };
}

export interface PCResource {
  type: string;
  id: string;
  attributes: JsonObject;
  relationships?: Record<string, PCRelationship>;
}

export interface PCRelationship {
  data?: PCResourceIdentifier | PCResourceIdentifier[] | null;
  links?: {
    related?: string;
  };
}

export interface PCResourceIdentifier {
  type: string;
  id: string;
}

// Person Types
export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  photoUrl: string | null;
  photoThumbnailUrl: string | null;
  archived: boolean;
  positions: TeamPosition[];
}

export interface RawPerson {
  type: "Person";
  id: string;
  attributes: {
    first_name: string;
    last_name: string;
    photo_url: string | null;
    photo_thumbnail_url: string | null;
    archived_at: string | null;
  };
  relationships?: {
    team_positions?: PCRelationship;
  };
}

// Team Types
export interface Team {
  id: string;
  name: string;
  sequence: number;
  rehearsalTeam: boolean;
}

export interface RawTeam {
  type: "Team";
  id: string;
  attributes: {
    name: string;
    sequence: number;
    rehearsal_team: boolean;
    archived_at: string | null;
  };
}

// Team Position Types
export interface TeamPosition {
  id: string;
  name: string;
  teamId: string;
  teamName?: string;
  source?: "team_position" | "needed_position" | "plan_member" | "custom";
  neededPositionId?: string;
  timeId?: string | null;
  timePreferenceOptionId?: string | null;
  neededCount?: number;
  filledPendingCount?: number;
  filledConfirmedCount?: number;
  filledPeople?: FilledPositionPerson[];
}

export interface FilledPositionPerson {
  id: string;
  planPersonId: string;
  personId?: string | null;
  name: string;
  status: "pending" | "confirmed";
  rawStatus: string;
  photoThumbnailUrl?: string | null;
  assignedTimeIds?: string[];
  serviceTimeIds?: string[];
}

export interface RawTeamPosition {
  type: "TeamPosition";
  id: string;
  attributes: {
    name: string;
  };
  relationships?: {
    team?: {
      data: PCResourceIdentifier;
    };
  };
}

// Blockout Types
export interface Blockout {
  id: string;
  reason: string;
  startsAt: Date;
  endsAt: Date;
  description: string;
  share: boolean;
  /** Services API `time_zone`, used for calendar-day blockout checks */
  timeZone?: string | null;
}

export interface RawBlockout {
  type: "Blockout";
  id: string;
  attributes: {
    reason: string;
    starts_at: string;
    ends_at: string;
    description: string;
    share: boolean;
    time_zone?: string | null;
  };
}

// PlanPerson Types (Scheduling History)
export interface PlanPerson {
  id: string;
  status: string;
  createdAt: Date;
  teamPositionName: string;
  planTitle?: string;
  planDate?: Date;
  declineReason?: string;
}

export interface RawPlanPerson {
  type: "PlanPerson";
  id: string;
  attributes: {
    status: string;
    created_at: string;
    team_position_name: string;
    decline_reason?: string;
  };
  relationships?: {
    plan?: {
      data?: PCResourceIdentifier | null;
    };
    team?: {
      data?: PCResourceIdentifier | null;
    };
    person?: {
      data?: PCResourceIdentifier | null;
    };
    times?: {
      data?: PCResourceIdentifier[] | null;
      links?: {
        related?: string;
      };
    };
    service_times?: {
      data?: PCResourceIdentifier[] | null;
      links?: {
        related?: string;
      };
    };
  };
}

// Schedule Types (Person schedule history / recommendations)
export interface RawSchedule {
  type: "Schedule";
  id: string;
  attributes: {
    status: string;
    sort_date?: string;
    team_name?: string;
    team_position_name?: string;
    service_type_name?: string;
    decline_reason?: string;
  };
  relationships?: {
    plan?: {
      data?: PCResourceIdentifier | null;
    };
    team?: {
      data?: PCResourceIdentifier | null;
    };
    service_type?: {
      data?: PCResourceIdentifier | null;
    };
    plan_person?: {
      data?: PCResourceIdentifier | null;
    };
    plan_times?: {
      data?: PCResourceIdentifier[] | null;
      links?: {
        related?: string;
      };
    };
    times?: {
      data?: PCResourceIdentifier[] | null;
      links?: {
        related?: string;
      };
    };
  };
}

export interface RawPlanTime {
  type: "PlanTime";
  id: string;
  attributes: {
    name?: string;
    starts_at?: string;
    ends_at?: string;
    /** Planning Center may send other values; handled as opaque string when parsing. */
    time_type?: string;
    team_reminders?: JsonValue;
  };
  relationships?: {
    plan?: {
      data?: PCResourceIdentifier;
    };
    assigned_teams?: {
      data?: PCResourceIdentifier[];
    };
    assigned_positions?: {
      data?: PCResourceIdentifier[];
    };
    split_team_rehearsal_assignments?: {
      data?: PCResourceIdentifier[];
    };
  };
}

// Service Type Types
export interface ServiceType {
  id: string;
  name: string;
  sequence: number;
}

export interface RawServiceType {
  type: "ServiceType";
  id: string;
  attributes: {
    name: string;
    sequence: number;
  };
}

// Plan Types
export interface Plan {
  id: string;
  title: string;
  seriesTitle?: string;
  seriesId?: string | null;
  planningCenterUrl?: string | null;
  createdAt: Date;
  sortDate?: Date;
}

export type PlanTimeType = "service" | "rehearsal" | "other";

export interface PlanTime {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  timeType: PlanTimeType;
  teamReminders: JsonValue;
  assignedTeamIds: string[];
  assignedPositionIds: string[];
  splitTeamRehearsalAssignmentIds: string[];
}

export interface RawPlan {
  type: "Plan";
  id: string;
  attributes: {
    title: string;
    series_title?: string;
    planning_center_url?: string | null;
    created_at: string;
    sort_date?: string;
  };
  relationships?: {
    service_type?: {
      data: PCResourceIdentifier;
    };
    series?: {
      data: PCResourceIdentifier | null;
    };
  };
}

export type PlanItemType = "song" | "header" | "item" | "media";
export type PlanItemServicePosition = "pre" | "during" | "post";

export interface PlanItemSong {
  id: string;
  title: string;
  author: string;
  themes: string;
  lastScheduledAt: Date | null;
}

export interface PlanItemArrangement {
  id: string;
  name: string;
  sequence: string[];
  length: number | null;
  archivedAt: Date | null;
}

export interface PlanItemKey {
  id: string;
  name: string;
  startingKey: string | null;
  endingKey: string | null;
}

export interface LayoutOption {
  id: string;
  name: string;
}

export interface PlanItem {
  id: string;
  title: string;
  itemType: PlanItemType;
  sequence: number;
  servicePosition: PlanItemServicePosition;
  length: number | null;
  description: string;
  htmlDetails: string;
  customArrangementSequence: string[];
  song: PlanItemSong | null;
  arrangement: PlanItemArrangement | null;
  key: PlanItemKey | null;
  layout: LayoutOption | null;
}

export interface RawItem {
  type: "Item";
  id: string;
  attributes: {
    title?: string;
    item_type?: string;
    sequence?: number;
    service_position?: string;
    length?: number;
    description?: string;
    html_details?: string;
    custom_arrangement_sequence?: JsonValue;
  };
  relationships?: {
    song?: {
      data?: PCResourceIdentifier | null;
    };
    arrangement?: {
      data?: PCResourceIdentifier | null;
    };
    key?: {
      data?: PCResourceIdentifier | null;
    };
    selected_layout?: {
      data?: PCResourceIdentifier | null;
    };
  };
}

export interface RawSong {
  type: "Song";
  id: string;
  attributes: {
    title?: string;
    author?: string;
    themes?: string;
    hidden?: boolean;
    last_scheduled_at?: string | null;
    created_at?: string;
    updated_at?: string;
  };
}

export interface RawArrangement {
  type: "Arrangement";
  id: string;
  attributes: {
    name?: string;
    sequence?: JsonValue;
    length?: number;
    archived_at?: string | null;
  };
}

export interface RawKey {
  type: "Key";
  id: string;
  attributes: {
    name?: string;
    starting_key?: string | null;
    ending_key?: string | null;
  };
}

export interface SongCatalogEntry {
  id: string;
  title: string;
  author: string;
  themes: string;
  hidden: boolean;
  lastScheduledAt: Date | null;
  matchScore?: number;
}

export interface ArrangementOption {
  id: string;
  name: string;
  sequence: string[];
  length: number | null;
  archived: boolean;
  keys: KeyOption[];
}

export interface KeyOption {
  id: string;
  name: string;
  startingKey: string | null;
  endingKey: string | null;
}

export interface SongOptionSet {
  song: SongCatalogEntry;
  arrangements: ArrangementOption[];
  layouts: LayoutOption[];
  currentLayout: LayoutOption | null;
  suggestedArrangementId: string | null;
  suggestedKeyId: string | null;
  suggestedLayoutId: string | null;
  layoutMode: "unavailable" | "existing-only" | "editable";
}

export interface RawNeededPosition {
  type: "NeededPosition";
  id: string;
  attributes: {
    quantity?: number;
    team_position_name?: string;
    scheduled_to?: string;
  };
  relationships?: {
    team?: {
      data: PCResourceIdentifier | null;
    };
    time?: {
      data: PCResourceIdentifier | null;
    };
    time_preference_option?: {
      data: PCResourceIdentifier | null;
    };
  };
}

// Service History Item Types
export interface ServiceHistoryItem {
  id: string;
  sourceScheduleId: string;
  date: Date;
  teamPositionName: string;
  teamName?: string;
  serviceTypeName?: string;
  planTitle?: string;
  status: string;
  timeType?: "service" | "rehearsal" | "other";
}

// Team Position Group Types
export interface TeamPositionGroup {
  teamId: string;
  teamName: string;
  positions: TeamPosition[];
}

// Utility type for frequency tracking
export interface ScheduleFrequency {
  // Past services (before the reference/plan date)
  /**
   * Distinct past calendar days with a service (on/before plan) within `PLAN_HISTORY_HALF_RANGE_DAYS`.
   * For “days on the schedule” in the same band as upcoming, add `recentRehearsalOnlyDays` (disjoint).
   */
  recentServedDays: number;
  last60Days: number;
  last90Days: number;
  // Most recent service BEFORE the plan date
  lastServedDate?: Date;
  // Total past services
  totalServed: number;

  // Past rehearsals (before the reference/plan date)
  /** Past days with rehearsal but no service, same band as `recentServedDays`; sum with that field for unique engagement days. */
  recentRehearsalOnlyDays: number;
  rehearsalLast60Days: number;
  rehearsalLast90Days: number;
  lastRehearsalDate?: Date;
  // Upcoming services (after the reference/plan date)
  totalRehearsals: number;
  // Number of services scheduled AFTER the plan date
  upcomingServices: number;
  // Next scheduled service AFTER the plan date
  nextUpcomingDate?: Date;

  // Upcoming rehearsals (after the reference/plan date)
  upcomingRehearsals: number;
  nextRehearsalDate?: Date;
}

// UI Helper Types
export type AvailabilityStatus = "available" | "blocked" | "unknown";
export type FrequencyLevel = "low" | "medium" | "high";

export interface PersonWithAvailability extends Person {
  availability?: AvailabilityStatus;
  frequency?: ScheduleFrequency;
  /** Not part of the candidate list; use `isBlockedForDate` or `people.blockouts`. */
  blockouts?: Blockout[];
  serviceHistory?: ServiceHistoryItem[];
  isBlockedForDate?: boolean;
  isScheduledForSelectedPlanPosition?: boolean;
  isConfirmedForSelectedPlanPosition?: boolean;
  isDeclinedForSelectedPlanPosition?: boolean;
  /** From Services `PlanPerson` / `Schedule` `decline_reason` when declined for the selected plan slot. */
  selectedPlanDeclineReason?: string | null;
  selectedPlanAssignmentLabels?: string[];
  scheduledPlanPersonId?: string;
  recommendationScore?: number;
  recommendationReasoning?: string[];
}
