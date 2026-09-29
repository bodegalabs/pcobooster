import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";

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

const isOnSlot = (person: PersonWithAvailability): boolean =>
  person.isConfirmedForSelectedPlanPosition === true ||
  person.isScheduledForSelectedPlanPosition === true;

/** Confirmed before pending. */
const onSlotSortKey = (person: PersonWithAvailability): number =>
  person.isConfirmedForSelectedPlanPosition === true ? 0 : 1;

const byScoreThenName = (
  a: PersonWithAvailability,
  b: PersonWithAvailability
): number => {
  const as = a.recommendationScore ?? 0;
  const bs = b.recommendationScore ?? 0;
  if (bs !== as) {
    return bs - as;
  }
  return a.fullName.localeCompare(b.fullName);
};

/**
 * People already on the slot, everyone who could be added (by recommendation), and blocked
 * or declined people at the end.
 */
export interface RecommendationStripPartition {
  onSlot: PersonWithAvailability[];
  candidates: PersonWithAvailability[];
  exceptions: PersonWithAvailability[];
}

/**
 * `settled: false` while history or availability is still arriving. Scores do not exist yet
 * (people sort by name), and blocked people stay in place with their label
 * instead of moving to the tail, so the list reorders once, when everything has arrived.
 * People who declined the slot are known from the first response and go to the tail at once.
 */
export const partitionPeopleForRecommendationStrip = (
  people: PersonWithAvailability[],
  { settled = true }: { settled?: boolean } = {}
): RecommendationStripPartition => {
  const onSlot: PersonWithAvailability[] = [];
  const candidates: PersonWithAvailability[] = [];
  const exceptions: PersonWithAvailability[] = [];
  const belongsInTail = (person: PersonWithAvailability) =>
    settled
      ? isStripTail(person)
      : person.isDeclinedForSelectedPlanPosition === true;

  for (const p of people) {
    // Someone on the slot stays with it even when blocked, so the conflict is in view.
    if (p.isDeclinedForSelectedPlanPosition !== true && isOnSlot(p)) {
      onSlot.push(p);
    } else if (belongsInTail(p)) {
      exceptions.push(p);
    } else {
      candidates.push(p);
    }
  }

  onSlot.sort(
    (a, b) => onSlotSortKey(a) - onSlotSortKey(b) || byScoreThenName(a, b)
  );
  candidates.sort(byScoreThenName);

  exceptions.sort(
    (a, b) => tailSortKey(a) - tailSortKey(b) || byScoreThenName(a, b)
  );

  return { onSlot, candidates, exceptions };
};
