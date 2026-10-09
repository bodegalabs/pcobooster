import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  authSearchSchema,
  peopleSearchSchema,
  personSearchSchema,
  planWorkspaceSearchSchema,
} from "./route-search";
import { parseSearch } from "./search-params";

describe("auth search", () => {
  it("reads the return path and OAuth error", () => {
    expect(
      Schema.decodeUnknownSync(authSearchSchema)(
        parseSearch("?next=%2Fpeople%2F1&error=access_denied")
      )
    ).toStrictEqual({ next: "/people/1", error: "access_denied" });
  });

  it("ignores repeated keys, which are ambiguous", () => {
    expect(
      Schema.decodeUnknownSync(authSearchSchema)(
        parseSearch("?next=/a&next=/b&error=x&error=y")
      )
    ).toStrictEqual({ next: undefined, error: undefined });
  });

  it("allows neither value", () => {
    expect(Schema.decodeUnknownSync(authSearchSchema)({})).toStrictEqual({});
  });
});

describe("plan workspace search", () => {
  it("keeps numeric Planning Center IDs as strings", () => {
    expect(
      Schema.decodeUnknownSync(planWorkspaceSearchSchema)(
        parseSearch("?teamId=12&positionId=034")
      )
    ).toStrictEqual({ teamId: "12", positionId: "034" });
  });

  it("drops malformed slot values instead of failing the page", () => {
    expect(
      Schema.decodeUnknownSync(planWorkspaceSearchSchema)(
        parseSearch("?teamId=1&teamId=2")
      )
    ).toStrictEqual({ teamId: undefined });
  });
});

describe("people search", () => {
  it("reads the view and a team scope, keeping numeric team IDs as strings", () => {
    expect(
      Schema.decodeUnknownSync(peopleSearchSchema)(
        parseSearch("?view=month&scope=team%3A0123")
      )
    ).toStrictEqual({ view: "month", scope: "team:0123" });
  });

  it("allows neither value and drops repeated ones", () => {
    expect(Schema.decodeUnknownSync(peopleSearchSchema)({})).toStrictEqual({});
    expect(
      Schema.decodeUnknownSync(peopleSearchSchema)(
        parseSearch("?view=month&view=health")
      )
    ).toStrictEqual({ view: undefined });
  });
});

describe("person search", () => {
  it("reads the month", () => {
    expect(
      Schema.decodeUnknownSync(personSearchSchema)(
        parseSearch("?month=2026-09")
      )
    ).toStrictEqual({ month: "2026-09" });
  });

  it("treats a missing or repeated month as the current month", () => {
    expect(Schema.decodeUnknownSync(personSearchSchema)({})).toStrictEqual({});
    expect(
      Schema.decodeUnknownSync(personSearchSchema)(
        parseSearch("?month=a&month=b")
      )
    ).toStrictEqual({ month: undefined });
  });
});
