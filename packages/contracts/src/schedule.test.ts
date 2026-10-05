import {
  scheduleAlreadyScheduledErrorDataSchema,
  scheduleAssignInputSchema,
  scheduleAssignOutputSchema,
  scheduleMutationOutputSchema,
  schedulePositionMismatchErrorDataSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/schedule";
import { Schema, Result } from "effect";
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
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(scheduleAssignInputSchema)({
          team_name: "Band",
        })
      )
    ).toBeFalsy();
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(scheduleAssignInputSchema)({
          ...assignment,
          positionName: " ",
        })
      )
    ).toBeFalsy();
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
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(scheduleUpdateStatusInputSchema)({
          ...status,
          status: "declined",
        })
      )
    ).toBeFalsy();
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(scheduleRemoveInputSchema)({
          planPersonId: " ",
        })
      )
    ).toBeFalsy();
  });

  it("requires the assignment id and literal success outputs", () => {
    const assigned = { success: true, data: { id: "plan-person-1" } };
    expect(
      Schema.decodeUnknownSync(scheduleAssignOutputSchema)(assigned)
    ).toStrictEqual(assigned);
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(scheduleAssignOutputSchema)({
          success: true,
          data: { id: "" },
        })
      )
    ).toBeFalsy();
    expect(
      Schema.decodeUnknownSync(scheduleMutationOutputSchema)({ success: true })
    ).toStrictEqual({
      success: true,
    });
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(scheduleMutationOutputSchema)({
          success: false,
        })
      )
    ).toBeFalsy();
  });

  it("preserves typed already-scheduled conflict details", () => {
    const withDetails = {
      message: "Person is already scheduled",
      details: "Planning Center rejected the duplicate assignment",
    };
    expect(
      Schema.decodeUnknownSync(scheduleAlreadyScheduledErrorDataSchema)(
        withDetails
      )
    ).toStrictEqual(withDetails);
    expect(
      Schema.decodeUnknownSync(scheduleAlreadyScheduledErrorDataSchema)({
        message: "Already scheduled",
      })
    ).toStrictEqual({ message: "Already scheduled" });
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(scheduleAlreadyScheduledErrorDataSchema)({
          message: "Already scheduled",
          details: { code: "duplicate" },
        })
      )
    ).toBeFalsy();
  });

  it("preserves selected and created position mismatch details", () => {
    const mismatch = {
      message: "Created assignment did not match the selected position",
      details: {
        selected: {
          teamId: "team-1",
          teamName: "Band",
          positionId: "position-1",
          positionName: "Keys",
        },
        created: {
          planPersonId: "plan-person-1",
          teamPositionName: "Band - Piano",
        },
      },
    };
    expect(
      Schema.decodeUnknownSync(schedulePositionMismatchErrorDataSchema)(
        mismatch
      )
    ).toStrictEqual(mismatch);
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(schedulePositionMismatchErrorDataSchema)({
          ...mismatch,
          details: {
            ...mismatch.details,
            created: { teamPositionName: "Band - Piano" },
          },
        })
      )
    ).toBeFalsy();
  });
});
