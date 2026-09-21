import type { PersonWithAvailability } from "@worship-admin/api/types";
import { partitionPeopleForRecommendationStrip } from "@worship-admin/api/use-cases/planning-center/people/recommendation-strip-order";
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
  it("orders actionable by recommendation score descending, exceptions after divider order", () => {
    const people = [
      basePerson("1", "A High", { recommendationScore: 90 }),
      basePerson("2", "B Low", { recommendationScore: 10 }),
      basePerson("3", "C Blocked", {
        isBlockedForDate: true,
        recommendationScore: 99,
      }),
      basePerson("4", "D Mid", { recommendationScore: 50 }),
    ];
    const { actionable, exceptions } =
      partitionPeopleForRecommendationStrip(people);
    expect(actionable.map((p) => p.id)).toStrictEqual(["1", "4", "2"]);
    expect(exceptions.map((p) => p.id)).toStrictEqual(["3"]);
  });

  it("places on-slot people first (confirmed before pending), then the rest by score", () => {
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
    const { actionable, exceptions } =
      partitionPeopleForRecommendationStrip(people);
    expect(actionable.map((p) => p.id)).toStrictEqual(["3", "1", "2"]);
    expect(exceptions.map((p) => p.id)).toStrictEqual([]);
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
    const { actionable, exceptions } =
      partitionPeopleForRecommendationStrip(people);
    expect(actionable.map((p) => p.id)).toStrictEqual(["o"]);
    expect(exceptions.map((p) => p.id)).toStrictEqual(["b", "d"]);
  });
});
