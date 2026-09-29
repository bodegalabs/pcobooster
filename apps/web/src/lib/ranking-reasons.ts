/** What a line of ranking reasoning is about, for its icon. */
export type RankingFactKind =
  | "history"
  | "fresh"
  | "service"
  | "rehearsal"
  | "load"
  | "preference"
  | "note";

/** One fact about a candidate, with the ranking adjustments it caused. */
export interface RankingFact {
  kind: RankingFactKind;
  text: string;
  adjustments: string[];
}

// Prefixes of the lines `scoreAndNormalizePeople` writes
// (packages/planning-center-models/src/candidate-scoring.ts).
const ADJUSTMENT_PATTERN =
  /^(?:Ranked (?:slightly )?lower|\w+ (?:rehearsal )?penalty):/u;
/** Recent-load adjustments stand alone: no fact line comes before them. */
const LOAD_SUFFIX = "before this plan";
const FACT_PATTERNS: readonly [RegExp, RankingFactKind][] = [
  [/^Last served/u, "history"],
  [/^No (?:past services|service history)/u, "fresh"],
  [/^Upcoming:/u, "service"],
  [/^Rehearsals? upcoming:/u, "rehearsal"],
  [/^(?:Prefers |At most |Marked Unavailable )/u, "preference"],
];

const factKind = (reason: string): RankingFactKind =>
  FACT_PATTERNS.find(([pattern]) => pattern.test(reason))?.[1] ?? "note";

/**
 * Groups ranking reasons into facts, attaching each adjustment ("Ranked lower: ...")
 * to the upcoming service or rehearsal it follows. Recent-load adjustments become
 * their own `load` facts.
 */
export const groupRankingReasons = (
  reasons: readonly string[]
): RankingFact[] => {
  const facts: RankingFact[] = [];
  for (const reason of reasons) {
    const previous = facts.at(-1);
    if (reason.endsWith(LOAD_SUFFIX)) {
      facts.push({ kind: "load", text: reason, adjustments: [] });
    } else if (ADJUSTMENT_PATTERN.test(reason) && previous !== undefined) {
      previous.adjustments.push(reason);
    } else {
      facts.push({ kind: factKind(reason), text: reason, adjustments: [] });
    }
  }
  return facts;
};

const PREFERENCE_WORDING: readonly [RegExp, string][] = [
  [/^Prefers to serve /u, "Prefers "],
  [/ in Planning Center$/u, ""],
];

/**
 * Scheduling preferences this plan goes against, as short phrases ("Prefers every 2
 * weeks", "Marked Unavailable for this position"). Preferences the plan fits are left out.
 */
export const preferenceConflicts = (reasons: readonly string[]): string[] => {
  const conflicts: string[] = [];
  for (const fact of groupRankingReasons(reasons)) {
    if (fact.kind !== "preference" || fact.adjustments.length === 0) {
      continue;
    }
    let { text } = fact;
    for (const [pattern, replacement] of PREFERENCE_WORDING) {
      text = text.replace(pattern, replacement);
    }
    conflicts.push(text);
  }
  return conflicts;
};
