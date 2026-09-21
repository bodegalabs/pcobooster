import type { PersonWithAvailability } from "@worship-admin/planning-center-models/types";

const isStripTail = (person: PersonWithAvailability): boolean =>
  person.isBlockedForDate === true ||
  person.isDeclinedForSelectedPlanPosition === true;

/** Within the tail: blocked before declined, then score, then name. */
const tailSortKey = (person: PersonWithAvailability): number => {
  if (person.isBlockedForDate === true) {
    return 0;
  }
  if (person.isDeclinedForSelectedPlanPosition === true) {
    return 1;
  }
  return 2;
};

/** Within actionable: confirmed first, then on-slot (pending), then everyone else. */
const actionableSortKey = (person: PersonWithAvailability): number => {
  if (person.isConfirmedForSelectedPlanPosition === true) {
    return 0;
  }
  if (person.isScheduledForSelectedPlanPosition === true) {
    return 1;
  }
  return 2;
};

/** On-slot people first, then everyone else by recommendation, then blocked & declined at the end. */
export interface RecommendationStripPartition {
  actionable: PersonWithAvailability[];
  exceptions: PersonWithAvailability[];
}

export const partitionPeopleForRecommendationStrip = (
  people: PersonWithAvailability[]
): RecommendationStripPartition => {
  const actionable: PersonWithAvailability[] = [];
  const exceptions: PersonWithAvailability[] = [];

  for (const p of people) {
    if (isStripTail(p)) {
      exceptions.push(p);
    } else {
      actionable.push(p);
    }
  }

  actionable.sort((a, b) => {
    const tk = actionableSortKey(a) - actionableSortKey(b);
    if (tk !== 0) {
      return tk;
    }
    const as = a.recommendationScore ?? 0;
    const bs = b.recommendationScore ?? 0;
    if (bs !== as) {
      return bs - as;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  exceptions.sort((a, b) => {
    const tr = tailSortKey(a) - tailSortKey(b);
    if (tr !== 0) {
      return tr;
    }
    const as = a.recommendationScore ?? 0;
    const bs = b.recommendationScore ?? 0;
    if (bs !== as) {
      return bs - as;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  return { actionable, exceptions };
};
