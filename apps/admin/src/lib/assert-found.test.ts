import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { assertFound } from "./assert-found";

const attempt = (value: string | null | undefined) => () => {
  assertFound(value);
};

describe(assertFound, () => {
  it.each([null, undefined])("throws a router not-found for %s", (value) => {
    expect(attempt(value)).toThrow(expect.toSatisfy(isNotFound));
  });

  it("accepts present values, including empty strings", () => {
    expect(attempt("")).not.toThrow();
  });
});
