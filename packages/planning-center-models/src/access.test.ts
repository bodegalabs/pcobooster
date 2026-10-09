import {
  deriveFeatureAccess,
  hasRestrictedAccess,
  serviceTypeAbilities,
  servicesPermissionLevelSchema,
} from "@pcobooster/planning-center-models/access";
import type {
  FeatureAvailability,
  PlanningCenterAccessSnapshot,
  ServicesAccess,
} from "@pcobooster/planning-center-models/access";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const decodeLevel = Schema.decodeUnknownSync(servicesPermissionLevelSchema);

type GrantedServices = Extract<ServicesAccess, { status: "granted" }>;

const services = (
  overrides: Partial<GrantedServices> = {}
): GrantedServices => ({
  status: "granted",
  organizationAdministrator: false,
  planLevel: "Viewer",
  maxPlanLevel: "Viewer",
  songLevel: "Viewer",
  canViewAllPeople: false,
  ledTeamCount: 0,
  serviceTypes: [
    { id: "sunday", name: "Sunday", level: null },
    { id: "youth", name: "Youth", level: null },
  ],
  ...overrides,
});

const peopleViewer: PlanningCenterAccessSnapshot["people"] = {
  status: "granted",
};

const snapshot = (
  overrides: Partial<GrantedServices> = {},
  people?: PlanningCenterAccessSnapshot["people"]
): PlanningCenterAccessSnapshot => ({
  services: services(overrides),
  people: people ?? peopleViewer,
});

const availability = (
  access: PlanningCenterAccessSnapshot
): Record<string, FeatureAvailability> =>
  Object.fromEntries(
    deriveFeatureAccess(access).map((entry) => [
      entry.feature,
      entry.availability,
    ])
  );

describe("Services permission levels", () => {
  it("reads Planning Center's names regardless of casing and separators", () => {
    expect(decodeLevel("Scheduled Viewer")).toBe("Scheduled Viewer");
    expect(decodeLevel("scheduled_viewer")).toBe("Scheduled Viewer");
    expect(decodeLevel(" editor ")).toBe("Editor");
  });

  it("treats unknown or missing values as unknown", () => {
    expect(decodeLevel("Owner")).toBeNull();
    expect(decodeLevel(3)).toBeNull();
    expect(decodeLevel(null)).toBeNull();
  });
});

describe(deriveFeatureAccess, () => {
  it("gives an organization administrator everything", () => {
    const access = snapshot({
      organizationAdministrator: true,
      planLevel: null,
      maxPlanLevel: null,
      songLevel: null,
    });

    expect(availability(access)).toStrictEqual({
      plans: "full",
      scheduling: "full",
      planEditing: "full",
      peopleSearch: "full",
      peopleDashboard: "full",
      songs: "full",
    });
    expect(hasRestrictedAccess(deriveFeatureAccess(access))).toBeFalsy();
  });

  it("gives an Editor everywhere full scheduling and editing", () => {
    const access = snapshot({
      planLevel: "Editor",
      maxPlanLevel: "Editor",
      songLevel: "Editor",
      canViewAllPeople: true,
    });

    expect(hasRestrictedAccess(deriveFeatureAccess(access))).toBeFalsy();
  });

  it("limits a Scheduler to the teams they lead", () => {
    const access = snapshot({
      planLevel: "Scheduler",
      maxPlanLevel: "Scheduler",
      ledTeamCount: 2,
    });
    const scheduling = deriveFeatureAccess(access).find(
      (entry) => entry.feature === "scheduling"
    );

    expect(scheduling).toStrictEqual({
      feature: "scheduling",
      label: "Schedule people",
      availability: "limited",
      detail:
        "You can schedule the 2 teams you lead. Other teams are view-only.",
      ask: "Editor in Services",
    });
    expect(availability(access).planEditing).toBe("none");
  });

  it("explains a Scheduler who leads no team can't schedule anyone", () => {
    const access = snapshot({
      planLevel: "Scheduler",
      maxPlanLevel: "Scheduler",
    });

    expect(availability(access).scheduling).toBe("none");
  });

  it("uses each service type's own level over the organization-wide one", () => {
    const access = snapshot({
      planLevel: "Viewer",
      maxPlanLevel: "Editor",
      serviceTypes: [
        { id: "sunday", name: "Sunday", level: "Editor" },
        { id: "youth", name: "Youth", level: "Viewer" },
      ],
    });

    expect(availability(access)).toMatchObject({
      scheduling: "limited",
      planEditing: "limited",
    });
  });

  it("limits a Scheduled Viewer to plans they're on", () => {
    const access = snapshot({
      planLevel: "Scheduled Viewer",
      maxPlanLevel: "Scheduled Viewer",
      songLevel: "Scheduled Viewer",
    });

    expect(availability(access)).toStrictEqual({
      plans: "limited",
      scheduling: "none",
      planEditing: "none",
      peopleSearch: "full",
      peopleDashboard: "none",
      songs: "none",
    });
  });

  it("marks searching the whole church unavailable without People access", () => {
    const access = snapshot({}, { status: "none" });

    expect(availability(access).peopleSearch).toBe("none");
  });

  it("marks everything unavailable without Services access", () => {
    const access: PlanningCenterAccessSnapshot = {
      services: { status: "none" },
      people: { status: "none" },
    };

    expect(
      deriveFeatureAccess(access).every(
        (entry) => entry.availability === "none"
      )
    ).toBeTruthy();
  });

  it("falls back to the organization-wide level when service types report none", () => {
    const access = snapshot({ planLevel: "Editor", serviceTypes: [] });

    expect(availability(access).planEditing).toBe("full");
  });
});

describe(serviceTypeAbilities, () => {
  const access = snapshot({
    planLevel: "Viewer",
    maxPlanLevel: "Editor",
    ledTeamCount: 1,
    serviceTypes: [
      { id: "sunday", name: "Sunday", level: "Editor" },
      { id: "youth", name: "Youth", level: "Scheduler" },
      { id: "kids", name: "Kids", level: null },
    ],
  });

  it("lets an Editor schedule and edit", () => {
    expect(serviceTypeAbilities(access, "sunday")).toStrictEqual({
      level: "Editor",
      scheduleAllTeams: true,
      scheduleLedTeams: true,
      editPlans: true,
    });
  });

  it("lets a Scheduler who leads a team schedule only led teams", () => {
    expect(serviceTypeAbilities(access, "youth")).toStrictEqual({
      level: "Scheduler",
      scheduleAllTeams: false,
      scheduleLedTeams: true,
      editPlans: false,
    });
  });

  it("falls back to the organization-wide level for unknown service types", () => {
    expect(serviceTypeAbilities(access, "kids").level).toBe("Viewer");
    expect(serviceTypeAbilities(access, "missing").level).toBe("Viewer");
  });
});
