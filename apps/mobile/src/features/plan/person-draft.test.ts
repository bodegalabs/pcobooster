import type { FilledPositionPerson } from "@pcobooster/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

import { rosterAssignment } from "./assignment";
import { PersonDraft } from "./person-draft";

const person: FilledPositionPerson = {
  id: "p",
  planPersonId: "pp",
  name: "Jordan",
  status: "pending",
  rawStatus: "U",
  notification: null,
};

const assignment = rosterAssignment(
  { planId: "plan", serviceTypeId: "service" },
  { teamId: "team", id: "position" },
  person
);

describe("person sheet commit", () => {
  it("saves only the final status, once, on close", async () => {
    const draft = new PersonDraft(assignment);
    const setStatus = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    draft.status = "confirmed";
    draft.status = "declined";
    await draft.commit({ setStatus });
    await draft.commit({ setStatus });
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(assignment, "declined");
  });

  it("does not write an unchanged or discarded draft", async () => {
    const draft = new PersonDraft(assignment);
    const setStatus = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    await draft.commit({ setStatus });
    draft.status = "confirmed";
    draft.discard();
    await draft.commit({ setStatus });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("allows a changed draft after an unchanged lifecycle cleanup", async () => {
    const draft = new PersonDraft(assignment);
    const setStatus = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    await draft.commit({ setStatus });
    draft.status = "confirmed";
    await draft.commit({ setStatus });
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(assignment, "confirmed");
  });
});
