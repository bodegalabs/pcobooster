import { ProductRpc } from "@pcobooster/contracts";
import { jsonValueSchema } from "@pcobooster/planning-center-models/json";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import fixture0 from "../../../apps/mobile/src/fixtures/access.me.json";
import fixture1 from "../../../apps/mobile/src/fixtures/accounts.list.json";
import fixture2 from "../../../apps/mobile/src/fixtures/accounts.select.json";
import fixture3 from "../../../apps/mobile/src/fixtures/catalog.adjacentPlans.json";
import fixture4 from "../../../apps/mobile/src/fixtures/catalog.organization.json";
import fixture5 from "../../../apps/mobile/src/fixtures/catalog.plan.json";
import fixture6 from "../../../apps/mobile/src/fixtures/catalog.plans.json";
import fixture7 from "../../../apps/mobile/src/fixtures/catalog.serviceTypes.json";
import fixture8 from "../../../apps/mobile/src/fixtures/catalog.teamPositions.json";
import fixture9 from "../../../apps/mobile/src/fixtures/chordCharts.create.json";
import fixture10 from "../../../apps/mobile/src/fixtures/chordCharts.createSong.json";
import fixture11 from "../../../apps/mobile/src/fixtures/chordCharts.lyricsSearch.json";
import fixture12 from "../../../apps/mobile/src/fixtures/chordCharts.pdf.json";
import fixture13 from "../../../apps/mobile/src/fixtures/chordCharts.song.json";
import fixture14 from "../../../apps/mobile/src/fixtures/chordCharts.update.json";
import fixture15 from "../../../apps/mobile/src/fixtures/demo.exit.json";
import fixture16 from "../../../apps/mobile/src/fixtures/demo.start.json";
import fixture17 from "../../../apps/mobile/src/fixtures/features.status.json";
import fixture18 from "../../../apps/mobile/src/fixtures/feedback.submit.json";
import fixture19 from "../../../apps/mobile/src/fixtures/health.json";
import fixture20 from "../../../apps/mobile/src/fixtures/neededPositions.adjust.json";
import fixture21 from "../../../apps/mobile/src/fixtures/people.blockouts.json";
import fixture22 from "../../../apps/mobile/src/fixtures/people.candidateDetails.json";
import fixture23 from "../../../apps/mobile/src/fixtures/people.dashboardActivity.json";
import fixture24 from "../../../apps/mobile/src/fixtures/people.dashboardPerson.json";
import fixture25 from "../../../apps/mobile/src/fixtures/people.dashboardRoster.json";
import fixture26 from "../../../apps/mobile/src/fixtures/people.myScheduledPlans.json";
import fixture27 from "../../../apps/mobile/src/fixtures/people.planWindowHistory.json";
import fixture28 from "../../../apps/mobile/src/fixtures/people.positionCandidates.json";
import fixture29 from "../../../apps/mobile/src/fixtures/people.search.json";
import fixture30 from "../../../apps/mobile/src/fixtures/planItems.create.json";
import fixture31 from "../../../apps/mobile/src/fixtures/planItems.delete.json";
import fixture32 from "../../../apps/mobile/src/fixtures/planItems.list.json";
import fixture33 from "../../../apps/mobile/src/fixtures/planItems.reorder.json";
import fixture34 from "../../../apps/mobile/src/fixtures/planItems.update.json";
import fixture35 from "../../../apps/mobile/src/fixtures/planPeople.updateTimes.json";
import fixture36 from "../../../apps/mobile/src/fixtures/planTimes.create.json";
import fixture37 from "../../../apps/mobile/src/fixtures/planTimes.delete.json";
import fixture38 from "../../../apps/mobile/src/fixtures/planTimes.list.json";
import fixture39 from "../../../apps/mobile/src/fixtures/planTimes.update.json";
import fixture40 from "../../../apps/mobile/src/fixtures/schedule.assign.json";
import fixture41 from "../../../apps/mobile/src/fixtures/schedule.remove.json";
import fixture42 from "../../../apps/mobile/src/fixtures/schedule.updateStatus.json";
import fixture43 from "../../../apps/mobile/src/fixtures/session.status.json";
import fixture44 from "../../../apps/mobile/src/fixtures/songs.history.json";
import fixture45 from "../../../apps/mobile/src/fixtures/songs.library.json";
import fixture46 from "../../../apps/mobile/src/fixtures/songs.options.json";
import fixture47 from "../../../apps/mobile/src/fixtures/songs.search.json";
import fixture48 from "../../../apps/mobile/src/fixtures/songs.suggestions.json";

const fixtureSchema = Schema.Struct({
  default: jsonValueSchema,
  cases: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        match: Schema.Record(Schema.String, jsonValueSchema),
        output: jsonValueSchema,
      })
    )
  ),
});
const fixtures = new Map<string, typeof fixtureSchema.Type>([
  ["access.me", Schema.decodeUnknownSync(fixtureSchema)(fixture0)],
  ["accounts.list", Schema.decodeUnknownSync(fixtureSchema)(fixture1)],
  ["accounts.select", Schema.decodeUnknownSync(fixtureSchema)(fixture2)],
  ["catalog.adjacentPlans", Schema.decodeUnknownSync(fixtureSchema)(fixture3)],
  ["catalog.organization", Schema.decodeUnknownSync(fixtureSchema)(fixture4)],
  ["catalog.plan", Schema.decodeUnknownSync(fixtureSchema)(fixture5)],
  ["catalog.plans", Schema.decodeUnknownSync(fixtureSchema)(fixture6)],
  ["catalog.serviceTypes", Schema.decodeUnknownSync(fixtureSchema)(fixture7)],
  ["catalog.teamPositions", Schema.decodeUnknownSync(fixtureSchema)(fixture8)],
  ["chordCharts.create", Schema.decodeUnknownSync(fixtureSchema)(fixture9)],
  [
    "chordCharts.createSong",
    Schema.decodeUnknownSync(fixtureSchema)(fixture10),
  ],
  [
    "chordCharts.lyricsSearch",
    Schema.decodeUnknownSync(fixtureSchema)(fixture11),
  ],
  ["chordCharts.pdf", Schema.decodeUnknownSync(fixtureSchema)(fixture12)],
  ["chordCharts.song", Schema.decodeUnknownSync(fixtureSchema)(fixture13)],
  ["chordCharts.update", Schema.decodeUnknownSync(fixtureSchema)(fixture14)],
  ["demo.exit", Schema.decodeUnknownSync(fixtureSchema)(fixture15)],
  ["demo.start", Schema.decodeUnknownSync(fixtureSchema)(fixture16)],
  ["features.status", Schema.decodeUnknownSync(fixtureSchema)(fixture17)],
  ["feedback.submit", Schema.decodeUnknownSync(fixtureSchema)(fixture18)],
  ["health", Schema.decodeUnknownSync(fixtureSchema)(fixture19)],
  [
    "neededPositions.adjust",
    Schema.decodeUnknownSync(fixtureSchema)(fixture20),
  ],
  ["people.blockouts", Schema.decodeUnknownSync(fixtureSchema)(fixture21)],
  [
    "people.candidateDetails",
    Schema.decodeUnknownSync(fixtureSchema)(fixture22),
  ],
  [
    "people.dashboardActivity",
    Schema.decodeUnknownSync(fixtureSchema)(fixture23),
  ],
  [
    "people.dashboardPerson",
    Schema.decodeUnknownSync(fixtureSchema)(fixture24),
  ],
  [
    "people.dashboardRoster",
    Schema.decodeUnknownSync(fixtureSchema)(fixture25),
  ],
  [
    "people.myScheduledPlans",
    Schema.decodeUnknownSync(fixtureSchema)(fixture26),
  ],
  [
    "people.planWindowHistory",
    Schema.decodeUnknownSync(fixtureSchema)(fixture27),
  ],
  [
    "people.positionCandidates",
    Schema.decodeUnknownSync(fixtureSchema)(fixture28),
  ],
  ["people.search", Schema.decodeUnknownSync(fixtureSchema)(fixture29)],
  ["planItems.create", Schema.decodeUnknownSync(fixtureSchema)(fixture30)],
  ["planItems.delete", Schema.decodeUnknownSync(fixtureSchema)(fixture31)],
  ["planItems.list", Schema.decodeUnknownSync(fixtureSchema)(fixture32)],
  ["planItems.reorder", Schema.decodeUnknownSync(fixtureSchema)(fixture33)],
  ["planItems.update", Schema.decodeUnknownSync(fixtureSchema)(fixture34)],
  [
    "planPeople.updateTimes",
    Schema.decodeUnknownSync(fixtureSchema)(fixture35),
  ],
  ["planTimes.create", Schema.decodeUnknownSync(fixtureSchema)(fixture36)],
  ["planTimes.delete", Schema.decodeUnknownSync(fixtureSchema)(fixture37)],
  ["planTimes.list", Schema.decodeUnknownSync(fixtureSchema)(fixture38)],
  ["planTimes.update", Schema.decodeUnknownSync(fixtureSchema)(fixture39)],
  ["schedule.assign", Schema.decodeUnknownSync(fixtureSchema)(fixture40)],
  ["schedule.remove", Schema.decodeUnknownSync(fixtureSchema)(fixture41)],
  ["schedule.updateStatus", Schema.decodeUnknownSync(fixtureSchema)(fixture42)],
  ["session.status", Schema.decodeUnknownSync(fixtureSchema)(fixture43)],
  ["songs.history", Schema.decodeUnknownSync(fixtureSchema)(fixture44)],
  ["songs.library", Schema.decodeUnknownSync(fixtureSchema)(fixture45)],
  ["songs.options", Schema.decodeUnknownSync(fixtureSchema)(fixture46)],
  ["songs.search", Schema.decodeUnknownSync(fixtureSchema)(fixture47)],
  ["songs.suggestions", Schema.decodeUnknownSync(fixtureSchema)(fixture48)],
]);

describe("retained fictional product fixtures", () => {
  it("retains a fixture for every native product operation", () => {
    expect([...ProductRpc.requests.keys()].toSorted()).toStrictEqual(
      [...fixtures.keys()].filter((tag) => tag !== "health").toSorted()
    );
  });

  it.each([...ProductRpc.requests])(
    "validates every approved success example for %s",
    (tag, procedure) => {
      const fixture = fixtures.get(tag);
      expect(fixture).toBeDefined();
      if (fixture === undefined) {
        throw new Error(`Missing fixture for ${tag}`);
      }
      const codec = Schema.toCodecJson(procedure.successSchema);
      for (const output of [
        fixture.default,
        ...(fixture.cases ?? []).map((entry) => entry.output),
      ]) {
        expect(Schema.decodeUnknownResult(codec)(output)._tag).toBe("Success");
      }
    }
  );
});
