import {
  scheduleAssignInputSchema,
  scheduleAssignOutputSchema,
  scheduleMutationOutputSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/schedule";
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
});
