import { describe, expect, it } from "vitest";

import { runInTurns } from "./in-turns";
import { peopleDestinations, peopleTestIds } from "./routes";

describe("Refreshing activity in turns", () => {
  it("runs every task in order, never more than the limit at once, past failures", async () => {
    const started: number[] = [];
    let active = 0;
    let maximum = 0;
    const tasks = Array.from({ length: 5 }, (_, index) => async () => {
      started.push(index);
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      if (index === 1) {
        throw new Error("Planning Center didn't answer.");
      }
    });
    await runInTurns(tasks, 2);
    expect(started).toStrictEqual([0, 1, 2, 3, 4]);
    expect(maximum).toBe(2);
  });
});

describe("People destinations", () => {
  it("addresses a person by id alone, with an optional month", () => {
    expect(peopleDestinations.person("4100104")).toBe("/people/4100104");
    expect(peopleDestinations.person("41 00", "2026-11")).toBe(
      "/people/41%2000?month=2026-11"
    );
    expect(peopleTestIds.row("4100104")).toBe("people-row-4100104");
  });
});
