import type { FilledPositionPerson } from "@pcobooster/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

import { PersonDraft } from "./person-draft";

const person: FilledPositionPerson = {
  id: "p",
  planPersonId: "pp",
  name: "Jordan",
  status: "pending",
  rawStatus: "U",
  notification: null,
};

describe("person sheet commit", () => {
  it("saves only the final status, once, on close", async () => {
    const draft = new PersonDraft(person);
    const setStatus = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    draft.status = "confirmed";
    draft.status = "declined";
    await draft.commit({ setStatus });
    await draft.commit({ setStatus });
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(person, "declined");
  });

  it("does not write an unchanged or discarded draft", async () => {
    const draft = new PersonDraft(person);
    const setStatus = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    await draft.commit({ setStatus });
    draft.status = "confirmed";
    draft.discard();
    await draft.commit({ setStatus });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("allows a changed draft after an unchanged lifecycle cleanup", async () => {
    const draft = new PersonDraft(person);
    const setStatus = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    await draft.commit({ setStatus });
    draft.status = "confirmed";
    await draft.commit({ setStatus });
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(person, "confirmed");
  });
});
