import {
  planSchema,
  teamPositionsInputSchema,
  teamPositionsOutputSchema,
} from "@worship-admin/contracts/catalog";
import { describe, expect, it } from "vitest";

describe("catalog contracts", () => {
  it("requires actual plan dates instead of silently accepting serialized dates", () => {
    const createdAt = new Date("2026-09-01T12:00:00Z");
    const sortDate = new Date("2026-09-20T17:00:00Z");
    const plan = {
      id: "plan-1",
      title: "Sunday",
      seriesTitle: "September",
      seriesId: null,
      planningCenterUrl: null,
      createdAt,
      sortDate,
    };

    expect(planSchema.parse(plan)).toStrictEqual(plan);
    expect(
      planSchema.safeParse({ ...plan, sortDate: sortDate.toISOString() })
        .success
    ).toBeFalsy();
    expect(
      planSchema.safeParse({ ...plan, createdAt: new Date(Number.NaN) }).success
    ).toBeFalsy();
  });

  it("preserves filled people and scheduling relationships through output validation", () => {
    const groups = [
      {
        teamId: "team-1",
        teamName: "Band",
        positions: [
          {
            id: "position-1",
            name: "Keys",
            teamId: "team-1",
            teamName: "Band",
            source: "needed_position",
            neededPositionId: "needed-1",
            timeId: null,
            timePreferenceOptionId: "preference-1",
            neededCount: 1,
            filledPendingCount: 0,
            filledConfirmedCount: 1,
            filledPeople: [
              {
                id: "person-1",
                planPersonId: "plan-person-1",
                personId: "person-1",
                name: "Person",
                status: "confirmed",
                rawStatus: "C",
                photoThumbnailUrl: null,
                assignedTimeIds: ["time-1", "time-2"],
                serviceTimeIds: ["time-2"],
              },
            ],
          },
        ],
      },
    ];

    expect(teamPositionsOutputSchema.parse(groups)).toStrictEqual(groups);
  });

  it("requires plan-scoped camelCase identifiers and leaves absent series IDs absent", () => {
    expect(
      teamPositionsInputSchema.parse({
        serviceTypeId: "service-1",
        planId: "plan-1",
      })
    ).toStrictEqual({ serviceTypeId: "service-1", planId: "plan-1" });
    expect(
      teamPositionsInputSchema.safeParse({
        service_type_id: "service-1",
        plan_id: "plan-1",
      }).success
    ).toBeFalsy();
    expect(
      teamPositionsInputSchema.safeParse({
        serviceTypeId: "service-1",
        planId: " ",
      }).success
    ).toBeFalsy();
  });
});
