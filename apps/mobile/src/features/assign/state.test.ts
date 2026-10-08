import { describe, expect, it } from "vitest";

import { assignViewReducer, initialViewState } from "./state";

describe("Assign selection state", () => {
  it("resets search and previews when changing positions", () => {
    const state = {
      ...initialViewState("a"),
      filter: "search",
      selected: "p",
      offersNext: true,
      errors: new Map([["p", "Couldn't add"]]),
    };
    expect(
      assignViewReducer(state, { kind: "position", selection: "b" })
    ).toStrictEqual({
      selection: "b",
      filter: "",
      selected: null,
      errors: new Map(),
      offersNext: false,
    });
  });

  it("ignores writes finishing after a different position opened", () => {
    const state = initialViewState("b");
    expect(
      assignViewReducer(state, {
        kind: "assigned",
        selection: "a",
        id: "person",
        error: null,
        offersNext: true,
      })
    ).toBe(state);
  });

  it("shows the failure message until a retry lands, then offers the next open position", () => {
    const failed = assignViewReducer(initialViewState("a"), {
      kind: "assigned",
      selection: "a",
      id: "p",
      error: "Planning Center is busy. Try again in a moment.",
      offersNext: false,
    });
    expect(failed.errors.get("p")).toBe(
      "Planning Center is busy. Try again in a moment."
    );
    const retried = assignViewReducer(failed, {
      kind: "assigned",
      selection: "a",
      id: "p",
      error: null,
      offersNext: true,
    });
    expect({
      errors: [...retried.errors],
      next: retried.offersNext,
    }).toStrictEqual({ errors: [], next: true });
    expect(
      assignViewReducer(retried, { kind: "dismissNext" }).offersNext
    ).toBeFalsy();
  });
});
