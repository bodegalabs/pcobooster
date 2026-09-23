import { expect, describe, it } from "vitest";

import { postHogPersonUrl } from "./posthog";

describe(postHogPersonUrl, () => {
  it("links to the person by user ID", () => {
    expect(postHogPersonUrl("user/1")).toBe(
      "https://us.posthog.com/project/614621/person/user%2F1"
    );
  });
});
