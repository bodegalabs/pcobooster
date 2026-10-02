import { normalizeArrangementOption } from "@pcobooster/api/modules/planning-center/plan-items-shared";
import { describe, expect, it } from "vitest";

describe(normalizeArrangementOption, () => {
  it("reads tempo and meter", () => {
    const arrangement = normalizeArrangementOption(
      {
        id: "arr-1",
        type: "Arrangement",
        attributes: {
          name: "Passion",
          bpm: 135,
          meter: "6/8",
          length: 333,
        },
      },
      []
    );

    expect(arrangement).toMatchObject({
      bpm: 135,
      meter: "6/8",
      length: 333,
    });
  });

  it("leaves a missing tempo and meter empty", () => {
    const arrangement = normalizeArrangementOption(
      { id: "arr-2", type: "Arrangement", attributes: { name: "Default" } },
      []
    );

    expect(arrangement.bpm).toBeNull();
    expect(arrangement.meter).toBeNull();
  });
});
