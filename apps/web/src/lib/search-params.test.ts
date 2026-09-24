import { describe, expect, it } from "vitest";

import { parseSearch, stringifySearch } from "./search-params";

describe(parseSearch, () => {
  it("keeps every value a string, like URLSearchParams", () => {
    expect(
      parseSearch("?teamId=12&positionId=034&flag=true&empty=")
    ).toStrictEqual({
      teamId: "12",
      positionId: "034",
      flag: "true",
      empty: "",
    });
  });

  it("decodes values once", () => {
    expect(parseSearch("next=%2Fpeople%2F1%3Fmonth%3D2026-09")).toStrictEqual({
      next: "/people/1?month=2026-09",
    });
  });

  it("collects repeated keys so schemas can reject them", () => {
    expect(parseSearch("?next=/a&next=/b")).toStrictEqual({
      next: ["/a", "/b"],
    });
  });

  it("parses an empty query", () => {
    expect(parseSearch("")).toStrictEqual({});
    expect(parseSearch("?")).toStrictEqual({});
  });
});

describe(stringifySearch, () => {
  it("writes plain values without JSON quoting", () => {
    expect(stringifySearch({ teamId: "12", positionId: "34" })).toBe(
      "?teamId=12&positionId=34"
    );
  });

  it("omits undefined and null values", () => {
    expect(stringifySearch({ month: undefined, teamId: null })).toBe("");
  });

  it("repeats array values", () => {
    expect(stringifySearch({ next: ["/a", "/b"] })).toBe(
      "?next=%2Fa&next=%2Fb"
    );
  });

  it("round-trips through parseSearch", () => {
    const search = { next: "/people/1?month=2026-09", error: "access_denied" };
    expect(parseSearch(stringifySearch(search))).toStrictEqual(search);
  });
});
