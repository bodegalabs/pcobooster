import { partitionPeopleForRecommendationStrip } from "@pcobooster/planning-center-models/recommendation-strip-order";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const basePerson = (
  id: string,
  fullName: string,
  overrides: Partial<PersonWithAvailability> = {}
): PersonWithAvailability => ({
  id,
  firstName: fullName.split(" ")[0] ?? fullName,
  lastName: fullName.split(" ").slice(1).join(" ") || "Test",
  fullName,
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  positions: [],
  ...overrides,
});

describe(partitionPeopleForRecommendationStrip, () => {
  it("orders candidates by recommendation score descending, exceptions after", () => {
    const people = [
      basePerson("1", "A High", { recommendationScore: 90 }),
      basePerson("2", "B Low", { recommendationScore: 10 }),
      basePerson("3", "C Blocked", {
        isBlockedForDate: true,
        recommendationScore: 99,
      }),
      basePerson("4", "D Mid", { recommendationScore: 50 }),
    ];
    const { candidates, exceptions } =
      partitionPeopleForRecommendationStrip(people);
    expect(candidates.map((p) => p.id)).toStrictEqual(["1", "4", "2"]);
    expect(exceptions.map((p) => p.id)).toStrictEqual(["3"]);
  });

  it("separates on-slot people (confirmed before pending) from candidates", () => {
    const people = [
      basePerson("1", "Scheduled", {
        isScheduledForSelectedPlanPosition: true,
        recommendationScore: 100,
      }),
      basePerson("2", "Open", { recommendationScore: 5 }),
      basePerson("3", "Confirmed", {
        isConfirmedForSelectedPlanPosition: true,
        recommendationScore: 0,
      }),
    ];
    const { onSlot, candidates, exceptions } =
      partitionPeopleForRecommendationStrip(people);
    expect(onSlot.map((p) => p.id)).toStrictEqual(["3", "1"]);
    expect(candidates.map((p) => p.id)).toStrictEqual(["2"]);
    expect(exceptions.map((p) => p.id)).toStrictEqual([]);
  });

  it("keeps a blocked person who is on the slot with the slot", () => {
    const people = [
      basePerson("1", "Blocked On Slot", {
        isScheduledForSelectedPlanPosition: true,
        isBlockedForDate: true,
      }),
      basePerson("2", "Blocked", { isBlockedForDate: true }),
    ];
    const { onSlot, candidates, exceptions } =
      partitionPeopleForRecommendationStrip(people);
    expect(onSlot.map((p) => p.id)).toStrictEqual(["1"]);
    expect(candidates.map((p) => p.id)).toStrictEqual([]);
    expect(exceptions.map((p) => p.id)).toStrictEqual(["2"]);
  });

  it("places declined after main strip, blocked before declined in tail", () => {
    const people = [
      basePerson("b", "Blocked", {
        isBlockedForDate: true,
        recommendationScore: 100,
      }),
      basePerson("d", "Declined", {
        isDeclinedForSelectedPlanPosition: true,
        recommendationScore: 100,
      }),
      basePerson("o", "Open", { recommendationScore: 50 }),
    ];
    const { candidates, exceptions } =
      partitionPeopleForRecommendationStrip(people);
    expect(candidates.map((p) => p.id)).toStrictEqual(["o"]);
    expect(exceptions.map((p) => p.id)).toStrictEqual(["b", "d"]);
  });

  it("keeps blocked people in place and orders by name while scores are pending", () => {
    const people = [
      basePerson("1", "Cara Blocked", {
        isBlockedForDate: true,
        availability: "blocked",
      }),
      basePerson("2", "Ben Pending", { availability: "unknown" }),
      basePerson("3", "Ann Declined", {
        isScheduledForSelectedPlanPosition: true,
        isDeclinedForSelectedPlanPosition: true,
      }),
      basePerson("4", "Dee Scheduled", {
        isScheduledForSelectedPlanPosition: true,
      }),
    ];
    const { onSlot, candidates, exceptions } =
      partitionPeopleForRecommendationStrip(people, { settled: false });
    expect({
      onSlot: onSlot.map((p) => p.id),
      candidates: candidates.map((p) => p.id),
      exceptions: exceptions.map((p) => p.id),
    }).toStrictEqual({
      onSlot: ["4"],
      candidates: ["2", "1"],
      exceptions: ["3"],
    });
  });
});
