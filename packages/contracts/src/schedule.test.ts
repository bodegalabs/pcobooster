import {
  scheduleAlreadyScheduledErrorDataSchema,
  scheduleAssignInputSchema,
  scheduleAssignOutputSchema,
  scheduleMutationOutputSchema,
  schedulePositionMismatchErrorDataSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@worship-admin/contracts/schedule";
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
    expect(scheduleAssignInputSchema.parse(assignment)).toStrictEqual(
      assignment
    );
    expect(
      scheduleAssignInputSchema.parse({
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
      scheduleAssignInputSchema.safeParse({
        team_name: "Band",
      }).success
    ).toBeFalsy();
    expect(
      scheduleAssignInputSchema.safeParse({ ...assignment, positionName: " " })
        .success
    ).toBeFalsy();
  });

  it("keeps remove and status context optional while requiring their route identity", () => {
    const remove = { planPersonId: "plan-person-1" };
    expect(scheduleRemoveInputSchema.parse(remove)).toStrictEqual(remove);
    const removeWithContext = {
      ...remove,
      serviceTypeId: "service-1",
      personId: "person-1",
      planId: "plan-1",
    };
    expect(scheduleRemoveInputSchema.parse(removeWithContext)).toStrictEqual(
      removeWithContext
    );

    const status = {
      ...removeWithContext,
      status: "D" as const,
    };
    expect(scheduleUpdateStatusInputSchema.parse(status)).toStrictEqual(status);
    expect(
      scheduleUpdateStatusInputSchema.safeParse({
        ...status,
        status: "declined",
      }).success
    ).toBeFalsy();
    expect(
      scheduleRemoveInputSchema.safeParse({ planPersonId: " " }).success
    ).toBeFalsy();
  });

  it("requires the assignment id and literal success outputs", () => {
    const assigned = { success: true, data: { id: "plan-person-1" } };
    expect(scheduleAssignOutputSchema.parse(assigned)).toStrictEqual(assigned);
    expect(
      scheduleAssignOutputSchema.safeParse({
        success: true,
        data: { id: "" },
      }).success
    ).toBeFalsy();
    expect(scheduleMutationOutputSchema.parse({ success: true })).toStrictEqual(
      {
        success: true,
      }
    );
    expect(
      scheduleMutationOutputSchema.safeParse({ success: false }).success
    ).toBeFalsy();
  });

  it("preserves typed already-scheduled conflict details", () => {
    const withDetails = {
      message: "Person is already scheduled",
      details: "Planning Center rejected the duplicate assignment",
    };
    expect(
      scheduleAlreadyScheduledErrorDataSchema.parse(withDetails)
    ).toStrictEqual(withDetails);
    expect(
      scheduleAlreadyScheduledErrorDataSchema.parse({
        message: "Already scheduled",
      })
    ).toStrictEqual({ message: "Already scheduled" });
    expect(
      scheduleAlreadyScheduledErrorDataSchema.safeParse({
        message: "Already scheduled",
        details: { code: "duplicate" },
      }).success
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
      schedulePositionMismatchErrorDataSchema.parse(mismatch)
    ).toStrictEqual(mismatch);
    expect(
      schedulePositionMismatchErrorDataSchema.safeParse({
        ...mismatch,
        details: {
          ...mismatch.details,
          created: { teamPositionName: "Band - Piano" },
        },
      }).success
    ).toBeFalsy();
  });
});
