import { z } from "zod";

/**
 * What the signed-in person's Planning Center permissions let them do in this app.
 *
 * Planning Center tokens act with the person's own permissions, so a person with low access
 * signs in fine and then finds screens empty or failing. The API reports those permissions
 * on each product's `/me`; this module turns that snapshot into per-feature answers the
 * product can show before anyone runs into a wall.
 */

/** Services permission levels, lowest first (Planning Center's own names). */
export const SERVICES_PERMISSION_LEVELS = [
  "Archived",
  "Scheduled Viewer",
  "Viewer",
  "Scheduler",
  "Editor",
  "Administrator",
] as const;

export type ServicesPermissionLevel =
  (typeof SERVICES_PERMISSION_LEVELS)[number];

const normalizeLevelName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]+/gu, " ");

const findLevel = <Level extends string>(
  levels: readonly Level[],
  name: string
): Level | null => {
  const normalized = normalizeLevelName(name);
  return (
    levels.find((level) => normalizeLevelName(level) === normalized) ?? null
  );
};

/**
 * A Services level from Planning Center, whatever its casing or separators. Planning Center
 * doesn't document every value, so anything missing or unrecognized reads as unknown (null).
 */
export const servicesPermissionLevelSchema = z
  .union([
    z.string().transform((name) => findLevel(SERVICES_PERMISSION_LEVELS, name)),
    z.json().transform(() => null),
  ])
  .optional()
  .transform((level) => level ?? null);

const servicesRank = (level: ServicesPermissionLevel | null): number =>
  level === null ? -1 : SERVICES_PERMISSION_LEVELS.indexOf(level);

/** Whether `level` is at least `minimum`; an unknown level never is. */
export const hasServicesLevel = (
  level: ServicesPermissionLevel | null,
  minimum: ServicesPermissionLevel
): boolean => servicesRank(level) >= servicesRank(minimum);

export interface ServiceTypeAccess {
  readonly id: string;
  readonly name: string;
  /** The person's level in this service type; null when Planning Center didn't say. */
  readonly level: ServicesPermissionLevel | null;
}

export type ServicesAccess =
  | { readonly status: "none" }
  | {
      readonly status: "granted";
      /** Planning Center Organization Administrator: can do anything in Services. */
      readonly organizationAdministrator: boolean;
      /** Organization-wide plan level (`plan_permissions`). */
      readonly planLevel: ServicesPermissionLevel | null;
      /** Highest plan level in any folder or service type (`max_plan_permissions`). */
      readonly maxPlanLevel: ServicesPermissionLevel | null;
      readonly songLevel: ServicesPermissionLevel | null;
      /** Whether the person can see people outside their own teams. */
      readonly canViewAllPeople: boolean;
      /** Teams the person leads; Schedulers can schedule only these. */
      readonly ledTeamCount: number;
      readonly serviceTypes: ServiceTypeAccess[];
    };

/**
 * Whether the person can search the church's people directory. People access can come from
 * the People app or from Services (Services editors reach People profiles), and `/me` shows
 * only the first, so this records whether the directory itself answered.
 */
export type PeopleAccess =
  | { readonly status: "none" }
  | { readonly status: "granted" };

/** The person's Planning Center permissions as the API reported them. */
export interface PlanningCenterAccessSnapshot {
  readonly services: ServicesAccess;
  readonly people: PeopleAccess;
}

export type AppFeature =
  | "plans"
  | "scheduling"
  | "planEditing"
  | "peopleSearch"
  | "peopleDashboard"
  | "songs"
  | "cleanup";

export type FeatureAvailability = "full" | "limited" | "none";

export interface FeatureAccess {
  readonly feature: AppFeature;
  readonly label: string;
  readonly availability: FeatureAvailability;
  /** What the person can do, written for them; empty when access is full. */
  readonly detail: string;
  /** The permission to ask a Planning Center admin for; null when nothing would help. */
  readonly ask: string | null;
}

/** Every feature, in the order the product lists them. */
export const APP_FEATURES = [
  "plans",
  "scheduling",
  "planEditing",
  "peopleSearch",
  "peopleDashboard",
  "songs",
  "cleanup",
] as const satisfies readonly AppFeature[];

export const APP_FEATURE_LABELS: Record<AppFeature, string> = {
  plans: "See plans",
  scheduling: "Schedule people",
  planEditing: "Edit run sheets and times",
  peopleSearch: "Schedule anyone in your church",
  peopleDashboard: "People dashboard",
  songs: "Chord charts",
  cleanup: "Data cleanup",
};

const feature = (
  name: AppFeature,
  availability: FeatureAvailability,
  detail = "",
  ask: string | null = null
): FeatureAccess => ({
  feature: name,
  label: APP_FEATURE_LABELS[name],
  availability,
  detail,
  ask,
});

type GrantedServices = Extract<ServicesAccess, { status: "granted" }>;

/** The person's level in one service type, falling back to their organization-wide level. */
export const serviceTypeLevel = (
  services: GrantedServices,
  serviceTypeId: string
): ServicesPermissionLevel | null => {
  if (services.organizationAdministrator) {
    return "Administrator";
  }
  const serviceType = services.serviceTypes.find(
    (candidate) => candidate.id === serviceTypeId
  );
  return serviceType?.level ?? services.planLevel;
};

const serviceTypeLevels = (
  services: GrantedServices
): (ServicesPermissionLevel | null)[] =>
  services.serviceTypes.length === 0
    ? [
        services.organizationAdministrator
          ? "Administrator"
          : services.planLevel,
      ]
    : services.serviceTypes.map((serviceType) =>
        serviceTypeLevel(services, serviceType.id)
      );

/** Full when every level qualifies, limited when some do, none otherwise. */
const coverage = (
  levels: readonly (ServicesPermissionLevel | null)[],
  minimum: ServicesPermissionLevel
): FeatureAvailability => {
  const qualifying = levels.filter((level) => hasServicesLevel(level, minimum));
  if (qualifying.length === 0) {
    return "none";
  }
  return qualifying.length === levels.length ? "full" : "limited";
};

const pluralTeams = (count: number): string =>
  count === 1 ? "the team you lead" : `the ${count} teams you lead`;

const plansAccess = (services: GrantedServices): FeatureAccess => {
  const availability = coverage(serviceTypeLevels(services), "Viewer");
  if (availability === "full") {
    return feature("plans", "full");
  }
  if (availability === "limited") {
    return feature(
      "plans",
      "limited",
      "You can see every plan in some service types, and only plans you're scheduled on in the rest.",
      "Viewer in Services"
    );
  }
  return feature(
    "plans",
    "limited",
    "You can see only the plans you're scheduled on.",
    "Viewer in Services"
  );
};

const schedulingAccess = (services: GrantedServices): FeatureAccess => {
  const levels = serviceTypeLevels(services);
  const editing = coverage(levels, "Editor");
  if (editing === "full") {
    return feature("scheduling", "full");
  }
  const schedulerAnywhere = levels.some((level) =>
    hasServicesLevel(level, "Scheduler")
  );
  if (editing === "limited") {
    return feature(
      "scheduling",
      "limited",
      "You can schedule every team in some service types. In the rest you can only look.",
      "Editor in Services"
    );
  }
  if (schedulerAnywhere && services.ledTeamCount > 0) {
    return feature(
      "scheduling",
      "limited",
      `You can schedule ${pluralTeams(services.ledTeamCount)}. Other teams are view-only.`,
      "Editor in Services"
    );
  }
  if (schedulerAnywhere) {
    return feature(
      "scheduling",
      "none",
      "You're a Scheduler, but you don't lead any teams, so there's no one you can schedule.",
      "Team leader on a team, or Editor in Services"
    );
  }
  return feature(
    "scheduling",
    "none",
    "You can see who's scheduled, but can't change it.",
    "Scheduler or Editor in Services"
  );
};

const planEditingAccess = (services: GrantedServices): FeatureAccess => {
  const availability = coverage(serviceTypeLevels(services), "Editor");
  if (availability === "full") {
    return feature("planEditing", "full");
  }
  if (availability === "limited") {
    return feature(
      "planEditing",
      "limited",
      "You can edit run sheets and service times in some service types.",
      "Editor in Services"
    );
  }
  return feature(
    "planEditing",
    "none",
    "Run sheets and service times are view-only for you.",
    "Editor in Services"
  );
};

const peopleSearchAccess = (people: PeopleAccess): FeatureAccess =>
  people.status === "granted"
    ? feature("peopleSearch", "full")
    : feature(
        "peopleSearch",
        "none",
        "You can schedule team members, but can't search the rest of your church.",
        "Viewer in People"
      );

const peopleDashboardAccess = (services: GrantedServices): FeatureAccess => {
  if (services.organizationAdministrator || services.canViewAllPeople) {
    return feature("peopleDashboard", "full");
  }
  if (hasServicesLevel(services.maxPlanLevel, "Viewer")) {
    return feature(
      "peopleDashboard",
      "limited",
      "You'll see only people on your own teams.",
      "Access to all people in Services"
    );
  }
  return feature(
    "peopleDashboard",
    "none",
    "You can't see other people's profiles in Services.",
    "Viewer in Services"
  );
};

const songsAccess = (services: GrantedServices): FeatureAccess => {
  const songLevel = services.organizationAdministrator
    ? "Administrator"
    : services.songLevel;
  if (hasServicesLevel(songLevel, "Editor")) {
    return feature("songs", "full");
  }
  if (hasServicesLevel(songLevel, "Viewer")) {
    return feature(
      "songs",
      "limited",
      "You can open chord charts, but can't save changes.",
      "Editor for songs in Services"
    );
  }
  return feature(
    "songs",
    "none",
    "You can't open the song library.",
    "Viewer for songs in Services"
  );
};

const cleanupAccess = (services: GrantedServices): FeatureAccess => {
  const songLevel = services.organizationAdministrator
    ? "Administrator"
    : services.songLevel;
  const seesAllPeople =
    services.organizationAdministrator || services.canViewAllPeople;
  const seesSongs = hasServicesLevel(songLevel, "Viewer");
  if (seesAllPeople && seesSongs) {
    return feature("cleanup", "full");
  }
  if (seesSongs || hasServicesLevel(services.maxPlanLevel, "Viewer")) {
    return feature(
      "cleanup",
      "limited",
      seesAllPeople
        ? "You can't review songs."
        : "You'll review only people on your own teams.",
      seesAllPeople
        ? "Viewer for songs in Services"
        : "Access to all people in Services"
    );
  }
  return feature(
    "cleanup",
    "none",
    "There's nothing here you have access to review.",
    "Viewer in Services"
  );
};

/**
 * Each feature's availability for this person. Without Services access nothing works, so
 * every feature is unavailable; the product shows that as one message instead of a list.
 */
export const deriveFeatureAccess = (
  snapshot: PlanningCenterAccessSnapshot
): FeatureAccess[] => {
  const { services, people } = snapshot;
  if (services.status === "none") {
    return APP_FEATURES.map((name) =>
      feature(
        name,
        "none",
        "Your Planning Center account can't open Services.",
        "Access to Services"
      )
    );
  }
  return [
    plansAccess(services),
    schedulingAccess(services),
    planEditingAccess(services),
    peopleSearchAccess(people),
    peopleDashboardAccess(services),
    songsAccess(services),
    cleanupAccess(services),
  ];
};

export interface ServiceTypeAbilities {
  readonly level: ServicesPermissionLevel | null;
  /** Can schedule every team in this service type. */
  readonly scheduleAllTeams: boolean;
  /** Can schedule at least the teams they lead. */
  readonly scheduleLedTeams: boolean;
  readonly editPlans: boolean;
}

/** What the person can change in one service type's plans. */
export const serviceTypeAbilities = (
  snapshot: PlanningCenterAccessSnapshot,
  serviceTypeId: string
): ServiceTypeAbilities => {
  const { services } = snapshot;
  if (services.status === "none") {
    return {
      level: null,
      scheduleAllTeams: false,
      scheduleLedTeams: false,
      editPlans: false,
    };
  }
  const level = serviceTypeLevel(services, serviceTypeId);
  const editor = hasServicesLevel(level, "Editor");
  return {
    level,
    scheduleAllTeams: editor,
    scheduleLedTeams:
      editor ||
      (hasServicesLevel(level, "Scheduler") && services.ledTeamCount > 0),
    editPlans: editor,
  };
};

/** Whether anything in the product is less than fully available to this person. */
export const hasRestrictedAccess = (features: readonly FeatureAccess[]) =>
  features.some((entry) => entry.availability !== "full");
