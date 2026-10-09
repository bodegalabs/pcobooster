import {
  scheduleAssignInputSchema,
  scheduleAssignOutputSchema,
  scheduleMutationOutputSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/http/schedule";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const assignment = {
  serviceTypeId: "service-1",
  personId: "person-1",
  planId: "plan-1",
  teamId: "team-1",
  positionId: "position-1",
  teamName: "Band",
  positionName: "Keys",
  oneOff: false,
};

describe("schedule contracts", () => {
  it("preserves the browser-facing assignment input and defaults one-off scheduling", () => {
    expect(
      Schema.decodeUnknownSync(scheduleAssignInputSchema)(assignment)
    ).toStrictEqual(assignment);
    expect(
      Schema.decodeUnknownSync(scheduleAssignInputSchema)({
        serviceTypeId: "service-1",
        personId: "person-1",
        planId: "plan-1",
        teamId: "team-1",
        positionId: "position-1",
      })
    ).toStrictEqual({
      serviceTypeId: "service-1",
      personId: "person-1",
      planId: "plan-1",
      teamId: "team-1",
      positionId: "position-1",
      oneOff: false,
    });
    expect(() =>
      Schema.decodeUnknownSync(scheduleAssignInputSchema)({
        team_name: "Band",
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(scheduleAssignInputSchema)({
        ...assignment,
        positionName: " ",
      })
    ).toThrow(Schema.SchemaError);
  });

  it("keeps remove and status context optional while requiring their route identity", () => {
    const remove = { planPersonId: "plan-person-1" };
    expect(
      Schema.decodeUnknownSync(scheduleRemoveInputSchema)(remove)
    ).toStrictEqual(remove);
    const removeWithContext = {
      ...remove,
      serviceTypeId: "service-1",
      personId: "person-1",
      planId: "plan-1",
    };
    expect(
      Schema.decodeUnknownSync(scheduleRemoveInputSchema)(removeWithContext)
    ).toStrictEqual(removeWithContext);

    const status = {
      ...removeWithContext,
      status: "D" as const,
    };
    expect(
      Schema.decodeUnknownSync(scheduleUpdateStatusInputSchema)(status)
    ).toStrictEqual(status);
    expect(() =>
      Schema.decodeUnknownSync(scheduleUpdateStatusInputSchema)({
        ...status,
        status: "declined",
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(scheduleRemoveInputSchema)({ planPersonId: " " })
    ).toThrow(Schema.SchemaError);
  });

  it("requires the assignment id and literal success outputs", () => {
    const assigned = { success: true, data: { id: "plan-person-1" } };
    expect(
      Schema.decodeUnknownSync(scheduleAssignOutputSchema)(assigned)
    ).toStrictEqual(assigned);
    expect(() =>
      Schema.decodeUnknownSync(scheduleAssignOutputSchema)({
        success: true,
        data: { id: "" },
      })
    ).toThrow(Schema.SchemaError);
    expect(
      Schema.decodeUnknownSync(scheduleMutationOutputSchema)({ success: true })
    ).toStrictEqual({
      success: true,
    });
    expect(() =>
      Schema.decodeUnknownSync(scheduleMutationOutputSchema)({ success: false })
    ).toThrow(Schema.SchemaError);
  });
});
