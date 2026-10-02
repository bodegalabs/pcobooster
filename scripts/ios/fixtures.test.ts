import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PEOPLE_DASHBOARD_SAMPLE_SIZE } from "@/lib/people-dashboard";
import { computeTeamHealth } from "@/lib/team-health";

import { appContract } from "../../packages/contracts/src/router";
import {
  fixtureAt,
  fixtureFileName,
  listFixturePaths,
  listProcedures,
  renderFixtureFile,
  toJsonData,
} from "./fixtures/fixture-file";
import type { StoredFixture } from "./fixtures/fixture-file";
import { chordChartPdfDocument } from "./fixtures/pdf";
import { fixtures, showcase } from "./fixtures/procedures";
import { songById } from "./fixtures/songs";
import { ANCHOR_TODAY } from "./fixtures/time";

/**
 * Writes the iOS mock fixtures (`bunx vitest run scripts/ios/fixtures.test.ts -u` after a data
 * or contract change) and pins them: every procedure in `appContract` has a fixture, every
 * output parses with the contract's output schema, and every case's `match` with its input.
 */

const fixtureDir = path.join(
  import.meta.dirname,
  "../../apps/ios/PCOBoosterCore/Sources/PCOBoosterMock/Fixtures"
);

const procedures = listProcedures(appContract).map((procedure) => ({
  ...procedure,
  name: procedure.path.join("."),
}));

const fixtureFor = (procedurePath: readonly string[]): StoredFixture => {
  const fixture = fixtureAt(fixtures, procedurePath);
  if (fixture === undefined) {
    throw new Error(`No fixture for ${procedurePath.join(".")}`);
  }
  return fixture;
};

describe("iOS mock fixtures", () => {
  it("cover every procedure in the contract, and nothing else", () => {
    expect(listFixturePaths(fixtures).toSorted()).toStrictEqual(
      procedures.map(({ name }) => name).toSorted()
    );
  });

  it.each(procedures)(
    "$name outputs parse with the contract's output schema",
    ({ path: procedurePath, outputSchema }) => {
      expect(outputSchema).toBeInstanceOf(z.ZodType);
      if (!(outputSchema instanceof z.ZodType)) {
        return;
      }
      const fixture = fixtureFor(procedurePath);
      const outputs = [
        fixture.default,
        ...(fixture.cases ?? []).map(({ output }) => output),
      ];
      for (const output of outputs) {
        const result = outputSchema.safeParse(output);
        expect(result.error?.issues).toBeUndefined();
        // Nothing stripped, defaulted, or transformed: the file is what the API would send.
        expect(result.data).toStrictEqual(output);
      }
    }
  );

  it.each(procedures)(
    "$name case matches are subsets of a valid input",
    ({ path: procedurePath, inputSchema }) => {
      const cases = fixtureFor(procedurePath).cases ?? [];
      if (cases.length === 0) {
        return;
      }
      expect(inputSchema).toBeInstanceOf(z.ZodObject);
      if (!(inputSchema instanceof z.ZodObject)) {
        return;
      }
      const partial = inputSchema.partial();
      for (const { match } of cases) {
        expect(toJsonData(match)).not.toStrictEqual({});
        expect(partial.safeParse(match).error?.issues).toBeUndefined();
      }
    }
  );

  it.each(procedures)(
    "$name file is current",
    async ({ path: procedurePath }) => {
      await expect(
        renderFixtureFile(fixtureFor(procedurePath))
      ).toMatchFileSnapshot(
        path.join(fixtureDir, fixtureFileName(procedurePath))
      );
    }
  );

  // After the snapshots above, so a first run has written every file.
  it("leave no stale files in the Fixtures folder", () => {
    const files = readdirSync(fixtureDir).filter((file) =>
      file.endsWith(".json")
    );
    expect(files.toSorted()).toStrictEqual(
      procedures
        .map(({ path: procedurePath }) => fixtureFileName(procedurePath))
        .toSorted()
    );
  });
});

describe("iOS mock dataset", () => {
  const showcaseGroups =
    fixtures.catalog.teamPositions.cases.find(
      ({ match }) => match.planId === showcase.planId
    )?.output ?? [];
  const showcasePositions = showcaseGroups.flatMap(
    ({ positions }) => positions
  );
  const showcasePeople = showcasePositions.flatMap(
    ({ filledPeople }) => filledPeople ?? []
  );

  it("puts confirmed, pending, and unsent people on the showcase plan", () => {
    const statuses = new Set(showcasePeople.map(({ status }) => status));
    expect([...statuses].toSorted()).toStrictEqual(["confirmed", "pending"]);
    const unsent = showcasePeople.filter(
      ({ notification }) => notification?.prepared === true
    );
    expect(unsent.length).toBeGreaterThanOrEqual(2);
  });

  it("leaves open slots of every kind on the showcase plan", () => {
    const open = showcasePositions.filter(
      ({ neededCount }) => (neededCount ?? 0) > 0
    );
    expect(open.length).toBeGreaterThanOrEqual(3);
    expect(showcasePositions.map(({ source }) => source)).toStrictEqual(
      expect.arrayContaining([
        "team_position",
        "plan_member",
        "needed_position",
      ])
    );
  });

  it("has one decline on the showcase plan", () => {
    const declined = fixtures.people.positionCandidates.cases.flatMap(
      ({ match, output }) =>
        "planId" in match && match.planId === showcase.planId
          ? output.candidates.filter(
              ({ selectedPlanSlot }) => selectedPlanSlot?.status === "declined"
            )
          : []
    );
    expect(declined.map(({ fullName }) => fullName)).toStrictEqual([
      "Avery Woods",
    ]);
  });

  it("splits the showcase window history across a continuation", () => {
    const [second, first] = fixtures.people.planWindowHistory.cases;
    expect(first?.output.deferredPlans.length).toBeGreaterThan(0);
    expect(first?.output.deferredServiceTypeIds).toStrictEqual(["1103"]);
    expect(second?.match.continuation?.plans).toStrictEqual(
      first?.output.deferredPlans
    );
    expect(second?.output.deferredPlans).toStrictEqual([]);
    expect(second?.output.deferredServiceTypeIds).toStrictEqual([]);
  });

  it("shows every People signal and team health list", () => {
    const roster = fixtures.people.dashboardRoster.default;
    const members = roster.people.flatMap((person) => {
      const activity = fixtures.people.dashboardActivity.default.people.find(
        ({ id }) => id === person.id
      );
      return activity === undefined ? [] : [{ ...person, ...activity }];
    });
    const health = computeTeamHealth(members, roster.teams, ANCHOR_TODAY);
    const kinds = new Set(
      [...health.signalsById.values()].flat().map(({ kind }) => kind)
    );
    expect([...kinds].toSorted()).toStrictEqual([
      "declining",
      "drifting",
      "due",
      "overloaded",
      "waiting",
    ]);
    expect(
      health.dueForSlot.some(({ daysSinceServed }) => daysSinceServed === null)
    ).toBeTruthy();
    expect(
      health.checkIns.some(({ member }) => member.id === showcase.personId)
    ).toBeTruthy();
    // More people than the dashboard's first sample, so "Load more" shows.
    expect(members.length).toBeGreaterThan(PEOPLE_DASHBOARD_SAMPLE_SIZE);
  });

  it("schedules the signed-in person on upcoming plans", () => {
    expect(fixtures.people.myScheduledPlans.default.planIds).toContain(
      showcase.planId
    );
  });

  it("gives the library songs from this month back to never", () => {
    const lastUsed = fixtures.songs.library.default.songs.map(
      ({ lastScheduledAt }) => lastScheduledAt?.getUTCFullYear() ?? null
    );
    expect(lastUsed).toStrictEqual(
      expect.arrayContaining([2026, 2025, 2024, 2023, null])
    );
    const { recentlyPlayed, resting } = fixtures.songs.suggestions.default;
    expect(recentlyPlayed.length).toBeGreaterThan(5);
    expect(resting.length).toBeGreaterThan(0);
  });

  it("builds chord chart PDFs with a valid cross-reference table", () => {
    const document = chordChartPdfDocument(songById(showcase.songId));
    expect(document).toMatch(/^%PDF-1\.4\n[\s\S]*%%EOF\n$/u);
    const startxref = Number(
      /startxref\n(?<offset>\d+)/u.exec(document)?.groups?.offset
    );
    expect(document.slice(startxref)).toMatch(/^xref\n/u);
    const misplaced = [
      ...document.matchAll(/^(?<offset>\d{10}) 00000 n $/gmu),
    ].filter(
      (match, index) =>
        !document
          .slice(Number(match.groups?.offset))
          .startsWith(`${index + 1} 0 obj\n`)
    );
    expect(misplaced).toStrictEqual([]);
  });
});
