import {
  blockoutProgressSchema,
  planWindowHistoryBatchSchema,
  positionCandidatesSchema,
  scheduleFrequencySchema,
  schedulingPreferencesSchema,
  serviceHistoryItemSchema,
} from "@pcobooster/contracts/people-schemas";
import {
  formatCalendarDayInTimeZone,
  orgCalendarDaysBetween,
  zonedWallTimeToUtcIso,
} from "@pcobooster/planning-center-models/calendar";
import { summarizeCandidateHistory } from "@pcobooster/planning-center-models/candidate-frequency";
import { scoreAndNormalizePeople } from "@pcobooster/planning-center-models/candidate-scoring";
import { transposeChordChartText } from "@pcobooster/planning-center-models/chord-chart";
import { parseKey } from "@pcobooster/planning-center-models/chord-chart-chords";
import {
  lyricsToChordChart,
  mergeChordsIntoLyrics,
} from "@pcobooster/planning-center-models/chord-chart-import";
import { expandPlanWindowHistory } from "@pcobooster/planning-center-models/plan-window-history";
import type { CandidateHistory } from "@pcobooster/planning-center-models/position-candidates";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { lyricsSearchQueryFor } from "../../../apps/web/src/lib/lyrics-search";
import fixture1 from "./fixtures/behavior/calendar.dayKey.json";
import fixture2 from "./fixtures/behavior/calendar.daysBetween.json";
import fixture0 from "./fixtures/behavior/calendar.utcInstant.json";
import fixture9 from "./fixtures/behavior/chordcharts.chart.transposeChordChartText.json";
import fixture10 from "./fixtures/behavior/chordcharts.import.lyricsToChordChart.json";
import fixture11 from "./fixtures/behavior/chordcharts.import.mergeChordsIntoLyrics.json";
import fixture8 from "./fixtures/behavior/chordcharts.lyricsSearchQuery.json";
import fixture6 from "./fixtures/behavior/scheduling.advancedBlockoutChecks.json";
import fixture5 from "./fixtures/behavior/scheduling.expandPlanWindowHistory.json";
import fixture7 from "./fixtures/behavior/scheduling.planCandidateDetailsBatches.json";
import fixture4 from "./fixtures/behavior/scheduling.scoreAndNormalize.json";
import fixture3 from "./fixtures/behavior/scheduling.summarizeCandidateHistory.json";
import {
  advancedBlockoutChecks,
  planCandidateDetailsBatches,
} from "./position-candidates";

const retainedFixtures = {
  "calendar.utcInstant": fixture0,
  "calendar.dayKey": fixture1,
  "calendar.daysBetween": fixture2,
  "scheduling.summarizeCandidateHistory": fixture3,
  "scheduling.scoreAndNormalize": fixture4,
  "scheduling.expandPlanWindowHistory": fixture5,
  "scheduling.advancedBlockoutChecks": fixture6,
  "scheduling.planCandidateDetailsBatches": fixture7,
  "chordcharts.lyricsSearchQuery": fixture8,
  "chordcharts.chart.transposeChordChartText": fixture9,
  "chordcharts.import.lyricsToChordChart": fixture10,
  "chordcharts.import.mergeChordsIntoLyrics": fixture11,
} as const;

const storedFixtureSchema = Schema.Struct({
  suite: Schema.String,
  sourceCaseIndices: Schema.Array(Schema.Finite),
  cases: Schema.Array(
    Schema.Struct({ input: Schema.Unknown, output: Schema.Unknown })
  ),
});

/** Frozen inputs and approved outputs retained from the former Swift behavioral fixtures. */
const fixtureCases = (suite: keyof typeof retainedFixtures) => {
  const fixture = Schema.decodeUnknownSync(storedFixtureSchema)(
    retainedFixtures[suite]
  );
  return fixture.cases.map((testCase, index) => ({
    ...testCase,
    sourceCase: fixture.sourceCaseIndices[index],
  }));
};

const date = Schema.Date;
const historyInput = Schema.toCodecJson(
  Schema.Struct({
    history: Schema.mutable(Schema.Array(serviceHistoryItemSchema)),
    referenceDate: date,
    timeZone: Schema.String,
  })
);
const personInput = Schema.Struct({
  id: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  fullName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
  photoThumbnailUrl: Schema.NullOr(Schema.String),
  archived: Schema.Boolean,
  availability: Schema.optional(
    Schema.Literals(["available", "blocked", "unknown"])
  ),
  frequency: Schema.optional(scheduleFrequencySchema),
  serviceHistory: Schema.optional(
    Schema.mutable(Schema.Array(serviceHistoryItemSchema))
  ),
  isBlockedForDate: Schema.optional(Schema.Boolean),
  isScheduledForSelectedPlanPosition: Schema.optional(Schema.Boolean),
  isConfirmedForSelectedPlanPosition: Schema.optional(Schema.Boolean),
  isDeclinedForSelectedPlanPosition: Schema.optional(Schema.Boolean),
  selectedPlanAssignmentLabels: Schema.optional(
    Schema.mutable(Schema.Array(Schema.String))
  ),
  schedulingPreferences: Schema.optional(
    Schema.NullOr(schedulingPreferencesSchema)
  ),
});
const scoreInput = Schema.toCodecJson(
  Schema.Struct({
    people: Schema.Array(personInput),
    referenceDate: date,
    timeZone: Schema.String,
    slot: Schema.Struct({
      planId: Schema.optional(Schema.String),
      slotTimePreferenceOptionId: Schema.optional(Schema.NullOr(Schema.String)),
    }),
  })
);
const scoreOutput = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    recommendationScore: Schema.Finite,
    recommendationReasoning: Schema.Array(Schema.String),
  })
);

// Only transport serialization is normalized; expected results are never regenerated.
const wireObject = (
  value:
    | ReturnType<typeof summarizeCandidateHistory>
    | { key: string; value: CandidateHistory }[]
): Schema.Json =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(
    JSON.stringify(value)
  );

describe("retained native behavioral evidence", () => {
  it.each(fixtureCases("calendar.utcInstant"))(
    "wall-time conversion case $sourceCase",
    ({ input, output }) => {
      const value = Schema.decodeUnknownSync(
        Schema.Struct({
          dateKey: Schema.String,
          timeValue: Schema.String,
          timeZone: Schema.String,
        })
      )(input);
      expect(
        zonedWallTimeToUtcIso(value.dateKey, value.timeValue, value.timeZone)
      ).toBe(output);
    }
  );

  it.each(fixtureCases("calendar.dayKey"))(
    "congregation date case $sourceCase",
    ({ input, output }) => {
      const { instant, timeZone } = Schema.decodeUnknownSync(
        Schema.Struct({ instant: Schema.String, timeZone: Schema.String })
      )(input);
      expect(formatCalendarDayInTimeZone(new Date(instant), timeZone)).toBe(
        output
      );
    }
  );

  it.each(fixtureCases("calendar.daysBetween"))(
    "calendar-day frequency delta case $sourceCase",
    ({ input, output }) => {
      const { a, b, timeZone } = Schema.decodeUnknownSync(
        Schema.Struct({
          a: Schema.String,
          b: Schema.String,
          timeZone: Schema.String,
        })
      )(input);
      expect(orgCalendarDaysBetween(new Date(a), new Date(b), timeZone)).toBe(
        output
      );
    }
  );

  it.each(fixtureCases("scheduling.summarizeCandidateHistory"))(
    "distinct service and rehearsal days case $sourceCase",
    ({ input, output }) => {
      const { history, referenceDate, timeZone } =
        Schema.decodeUnknownSync(historyInput)(input);
      expect(
        wireObject(summarizeCandidateHistory(history, referenceDate, timeZone))
      ).toStrictEqual(output);
    }
  );

  it.each(fixtureCases("scheduling.scoreAndNormalize"))(
    "recommendation score and reasons case $sourceCase",
    ({ input, output }) => {
      const value = Schema.decodeUnknownSync(scoreInput)(input);
      const people: PersonWithAvailability[] = value.people.map((person) => ({
        ...person,
        positions: [],
      }));
      scoreAndNormalizePeople(
        people,
        value.referenceDate,
        value.timeZone,
        value.slot
      );
      expect(Schema.decodeUnknownSync(scoreOutput)(people)).toStrictEqual(
        Schema.decodeUnknownSync(scoreOutput)(output)
      );
    }
  );

  it.each(fixtureCases("scheduling.expandPlanWindowHistory"))(
    "progressive roster expansion case $sourceCase",
    ({ input, output }) => {
      const { calls, selectedPlanId } = Schema.decodeUnknownSync(
        Schema.Struct({
          calls: Schema.Array(planWindowHistoryBatchSchema),
          selectedPlanId: Schema.String,
        })
      )(input);
      const entries = [...expandPlanWindowHistory(calls, selectedPlanId)].map(
        ([key, value]) => ({ key, value })
      );
      expect(wireObject(entries)).toStrictEqual(output);
    }
  );

  it.each(fixtureCases("scheduling.advancedBlockoutChecks"))(
    "blockout continuation progress case $sourceCase",
    ({ input, output }) => {
      const { before, after } = Schema.decodeUnknownSync(
        Schema.Struct({
          before: Schema.mutable(Schema.Array(blockoutProgressSchema)),
          after: Schema.mutable(Schema.Array(blockoutProgressSchema)),
        })
      )(input);
      expect(advancedBlockoutChecks(before, after)).toBe(output);
    }
  );

  it.each(fixtureCases("scheduling.planCandidateDetailsBatches"))(
    "bounded detail batches case $sourceCase",
    ({ input, output }) => {
      const { candidates, batchSize } = Schema.decodeUnknownSync(
        Schema.Struct({
          candidates: Schema.NullOr(positionCandidatesSchema),
          batchSize: Schema.Finite,
        })
      )(input);
      expect(
        planCandidateDetailsBatches(candidates ?? undefined, batchSize)
      ).toStrictEqual(output);
    }
  );

  it.each(fixtureCases("chordcharts.lyricsSearchQuery"))(
    "first-writer lyrics query case $sourceCase",
    ({ input, output }) => {
      const { title, author } = Schema.decodeUnknownSync(
        Schema.Struct({ title: Schema.String, author: Schema.String })
      )(input);
      expect(lyricsSearchQueryFor(title, author)).toBe(output);
    }
  );

  it.each(fixtureCases("chordcharts.chart.transposeChordChartText"))(
    "chart transposition preserves lyrics case $sourceCase",
    ({ input, output }) => {
      const { text, from, to } = Schema.decodeUnknownSync(
        Schema.Struct({
          text: Schema.String,
          from: Schema.String,
          to: Schema.String,
        })
      )(input);
      const sourceKey = parseKey(from);
      const targetKey = parseKey(to);
      if (sourceKey === null || targetKey === null) {
        throw new Error("Fixture contains an invalid musical key");
      }
      expect(transposeChordChartText(text, sourceKey, targetKey)).toBe(output);
    }
  );

  it.each(fixtureCases("chordcharts.import.lyricsToChordChart"))(
    "lyrics sections case $sourceCase",
    ({ input, output }) => {
      expect(
        lyricsToChordChart(Schema.decodeUnknownSync(Schema.String)(input))
      ).toBe(output);
    }
  );

  it.each(fixtureCases("chordcharts.import.mergeChordsIntoLyrics"))(
    "chord and lyric alignment case $sourceCase",
    ({ input, output }) => {
      const { chordLine, lyricLine } = Schema.decodeUnknownSync(
        Schema.Struct({ chordLine: Schema.String, lyricLine: Schema.String })
      )(input);
      expect(mergeChordsIntoLyrics(chordLine, lyricLine)).toBe(output);
    }
  );
});
