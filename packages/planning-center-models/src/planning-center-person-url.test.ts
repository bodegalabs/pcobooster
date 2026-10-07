import { describe, expect, it } from "vitest";

import { planningCenterPersonUrl } from "./planning-center-person-url";

describe(planningCenterPersonUrl, () => {
  it("links a person's own page in Planning Center People, with the id encoded", () => {
    expect(planningCenterPersonUrl("4100111")).toBe(
      "https://people.planningcenteronline.com/people/AC4100111"
    );
    expect(planningCenterPersonUrl("a/b c")).toBe(
      "https://people.planningcenteronline.com/people/ACa%2Fb%20c"
    );
  });
});
