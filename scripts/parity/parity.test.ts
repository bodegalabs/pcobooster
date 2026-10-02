import path from "node:path";

import { describe, expect, it } from "vitest";

import { paritySuites } from "./suites";

const fixtureDir = path.join(
  import.meta.dirname,
  "../../apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Fixtures/parity"
);

describe("iOS parity fixtures", () => {
  it("names every suite uniquely", () => {
    const names = paritySuites.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(paritySuites)("$name", async ({ name, render }) => {
    await expect(render()).toMatchFileSnapshot(
      path.join(fixtureDir, `${name}.json`)
    );
  });
});
