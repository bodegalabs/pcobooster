import {
  planSchema,
  teamPositionGroupSchema,
  teamPositionsInputSchema,
} from "@pcobooster/contracts/http/catalog";
import { Schema } from "effect";
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

    expect(Schema.decodeUnknownSync(planSchema)(plan)).toStrictEqual(plan);
    expect(() =>
      Schema.decodeUnknownSync(planSchema)({
        ...plan,
        sortDate: sortDate.toISOString(),
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(planSchema)({
        ...plan,
        createdAt: new Date(Number.NaN),
      })
    ).toThrow(Schema.SchemaError);
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
                notification: {
                  prepared: false,
                  sentAt: "2026-09-20T15:00:00Z",
                  senderName: "Sam Scheduler",
                },
              },
            ],
          },
        ],
      },
    ];

    expect(
      Schema.decodeUnknownSync(Schema.Array(teamPositionGroupSchema))(groups)
    ).toStrictEqual(groups);
  });

  it("requires plan-scoped camelCase identifiers and leaves absent series IDs absent", () => {
    expect(
      Schema.decodeUnknownSync(teamPositionsInputSchema)({
        serviceTypeId: "service-1",
        planId: "plan-1",
      })
    ).toStrictEqual({ serviceTypeId: "service-1", planId: "plan-1" });
    expect(() =>
      Schema.decodeUnknownSync(teamPositionsInputSchema)({
        service_type_id: "service-1",
        plan_id: "plan-1",
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(teamPositionsInputSchema)({
        serviceTypeId: "service-1",
        planId: " ",
      })
    ).toThrow(Schema.SchemaError);
  });
});
