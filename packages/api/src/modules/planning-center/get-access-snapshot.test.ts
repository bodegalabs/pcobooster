import { getAccessSnapshot } from "@pcobooster/api/modules/planning-center/get-access-snapshot";
import type { AccessSnapshotDependencies } from "@pcobooster/api/modules/planning-center/get-access-snapshot";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const servicesMe: PCResource = {
  id: "person-1",
  type: "Person",
  attributes: {
    site_administrator: false,
    plan_permissions: "Scheduler",
    max_plan_permissions: "Editor",
    song_permissions: "Viewer",
    can_view_all_people: false,
  },
};

const serviceTypes: PCResource[] = [
  {
    id: "youth",
    type: "ServiceType",
    attributes: { name: "Youth", sequence: 2, permissions: "Scheduler" },
  },
  {
    id: "sunday",
    type: "ServiceType",
    attributes: { name: "Sunday", sequence: 1, permissions: "Editor" },
  },
  {
    id: "old",
    type: "ServiceType",
    attributes: {
      name: "Old",
      sequence: 0,
      permissions: "Administrator",
      archived_at: "2025-01-01T00:00:00Z",
    },
  },
];

const teamLeader = (id: string, teamId: string): PCResource => ({
  id,
  type: "TeamLeader",
  attributes: {},
  relationships: { team: { data: { type: "Team", id: teamId } } },
});

const denied = (status: number, code?: string) =>
  Effect.fail(new PlanningCenterApiError({ message: "denied", status, code }));

const dependencies = (
  overrides: Partial<AccessSnapshotDependencies["accessService"]> = {}
): AccessSnapshotDependencies => ({
  accessService: {
    getServicesMe: () => Effect.succeed(servicesMe),
    getTeamLeaders: () =>
      Effect.succeed([
        teamLeader("leader-1", "team-1"),
        teamLeader("leader-2", "team-1"),
        teamLeader("leader-3", "team-2"),
      ]),
    probePeopleDirectory: () =>
      Effect.succeed([{ id: "person-9", type: "Person", attributes: {} }]),
    ...overrides,
  },
  catalogService: {
    getServiceTypesCached: () => Effect.succeed(serviceTypes),
  },
});

describe(getAccessSnapshot, () => {
  it("reads Services and People permissions into a snapshot", async () => {
    const snapshot = await Effect.runPromise(getAccessSnapshot(dependencies()));

    expect(snapshot).toStrictEqual({
      services: {
        status: "granted",
        organizationAdministrator: false,
        planLevel: "Scheduler",
        maxPlanLevel: "Editor",
        songLevel: "Viewer",
        canViewAllPeople: false,
        ledTeamCount: 2,
        serviceTypes: [
          { id: "sunday", name: "Sunday", level: "Editor" },
          { id: "youth", name: "Youth", level: "Scheduler" },
        ],
      },
      people: { status: "granted" },
    });
  });

  it("reports no access when Planning Center refuses the product", async () => {
    const snapshot = await Effect.runPromise(
      getAccessSnapshot(
        dependencies({
          getServicesMe: () => denied(401, "TRASH_PANDA"),
          probePeopleDirectory: () => denied(403),
        })
      )
    );

    expect(snapshot).toStrictEqual({
      services: { status: "none" },
      people: { status: "none" },
    });
  });

  it("fails instead of guessing when Planning Center is unavailable", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(
        getAccessSnapshot(
          dependencies({ probePeopleDirectory: () => denied(503) })
        )
      )
    );

    expect(failure).toMatchObject({ status: 503 });
  });
});
