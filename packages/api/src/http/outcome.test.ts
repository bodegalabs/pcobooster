import { procedureOutcome } from "@pcobooster/api/http/outcome";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { Cause, Exit } from "effect";
import { describe, expect, it } from "vitest";

const notFound = new NotFound({ message: "No plan", resource: "plan" });

describe(procedureOutcome, () => {
  it("answers a lone product fault with its status and code", () => {
    expect(procedureOutcome(Exit.fail(notFound))).toStrictEqual({
      kind: "fault",
      status: 404,
      code: "NOT_FOUND",
      fault: notFound,
    });
  });

  it("logs an interrupt-only exit as 499", () => {
    expect(procedureOutcome(Exit.interrupt())).toStrictEqual({
      kind: "interrupted",
      status: 499,
      code: "CLIENT_CLOSED_REQUEST",
    });
  });

  it.each([
    ["a defect", Exit.die(new Error("boom"))],
    ["a failure that is not a product fault", Exit.fail(new Error("raw"))],
    [
      "a fault beside a defect",
      Exit.failCause(
        Cause.combine(Cause.fail(notFound), Cause.die(new Error("boom")))
      ),
    ],
  ])("answers %s with 500", (_name, exit) => {
    expect(procedureOutcome(exit)).toMatchObject({
      kind: "unexpected",
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
