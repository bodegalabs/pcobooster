import { describe, expect, it } from "vitest";

import { parseTeamEmails } from "./access";

describe(parseTeamEmails, () => {
  it("normalizes the configured addresses", () => {
    expect(parseTeamEmails(" A@Example.com, b@x.io ,")).toStrictEqual([
      "a@example.com",
      "b@x.io",
    ]);
  });

  it("falls back to the owner when none are configured", () => {
    expect(parseTeamEmails(" , ")).toStrictEqual(["jakebodea@gmail.com"]);
  });
});
