/**
 * Rating and advice for key changes between back-to-back songs, following
 * docs/research/song-key-transitions.md. Every suggestion names real chords and keys
 * ("Play a B7"), spelled in the key the band is heading into.
 */
import {
  chordName,
  circleOfFifthsDistance,
  commonToneChords,
  commonTones,
  dominantIsIn,
  homeChordIsIn,
  dominantSeventhOf,
  keyName,
  noteName,
  parallelOf,
  pivotChords,
  relativePivots,
  semitonesUp,
} from "@/lib/key-theory";
import type { MusicalKey } from "@/lib/key-theory";

export type KeyTransitionLevel = "smooth" | "worth-a-look" | "rough";

export type KeyChangeKind =
  | "same"
  | "parallel"
  | "relative"
  | "close"
  | "lift"
  | "mediant"
  | "step-down"
  | "half-step-down"
  | "tritone"
  | "distant-mode";

export interface KeyChangeRating {
  level: KeyTransitionLevel;
  kind: KeyChangeKind;
  reason: string;
}

const THIRD_NAMES = new Map([
  [3, "Up a minor third"],
  [4, "Up a major third"],
  [8, "Down a major third"],
  [9, "Down a minor third"],
]);
const WHOLE_STEP_DOWN = 10;
const HALF_STEP_DOWN = 11;
const LIFT_LIMIT = 2;
const DISTANT = 3;
const OCTAVE = 12;

const rateSameMode = (
  from: MusicalKey,
  to: MusicalKey,
  up: number
): KeyChangeRating => {
  if (up <= LIFT_LIMIT) {
    return {
      level: "smooth",
      kind: "lift",
      reason: `Lift up a ${up === 1 ? "half" : "whole"} step`,
    };
  }
  const third = THIRD_NAMES.get(up);
  if (third !== undefined) {
    const [shared] = commonTones(from, to);
    return {
      level: "worth-a-look",
      kind: "mediant",
      reason:
        shared === undefined
          ? third
          : `${third}: shares only ${noteName(shared)}`,
    };
  }
  if (up === WHOLE_STEP_DOWN) {
    return {
      level: "worth-a-look",
      kind: "step-down",
      reason: "Down a whole step",
    };
  }
  if (up === HALF_STEP_DOWN) {
    return {
      level: "rough",
      kind: "half-step-down",
      reason: "Down a half step: sounds flat without a setup",
    };
  }
  return {
    level: "rough",
    kind: "tritone",
    reason: "Tritone apart: no shared notes",
  };
};

/** How a change straight from one key into another is likely to feel (rows 1 to 11). */
export const rateKeyChange = (
  from: MusicalKey,
  to: MusicalKey
): KeyChangeRating => {
  const up = semitonesUp(from, to);
  const distance = circleOfFifthsDistance(from, to);
  if (up === 0) {
    return from.minor === to.minor
      ? { level: "smooth", kind: "same", reason: "Same key" }
      : {
          level: "smooth",
          kind: "parallel",
          reason: `Parallel key: same tonic, ${to.minor ? "darker" : "brighter"}`,
        };
  }
  if (distance === 0) {
    return {
      level: "smooth",
      kind: "relative",
      reason: "Relative key: same key signature",
    };
  }
  if (distance === 1) {
    return { level: "smooth", kind: "close", reason: "Closely related key" };
  }
  if (from.minor === to.minor) {
    return rateSameMode(from, to, up);
  }
  const effective = Math.min(
    distance,
    circleOfFifthsDistance(from, parallelOf(to)) + 1
  );
  return {
    level: effective >= DISTANT ? "rough" : "worth-a-look",
    kind: "distant-mode",
    reason: "Distant key with a mode change",
  };
};

/** Suggestion text in pieces, so chord and key names can stand out. */
export type AdviceSegment =
  | { kind: "text"; text: string }
  | { kind: "chord"; text: string };

export interface TransitionSuggestion {
  id: string;
  title: string;
  segments: AdviceSegment[];
}

export interface TransitionSongs {
  fromTitle: string;
  toTitle: string;
  fromKey: MusicalKey;
  toKey: MusicalKey;
}

const text = (value: string): AdviceSegment => ({ kind: "text", text: value });
const chord = (value: string): AdviceSegment => ({
  kind: "chord",
  text: value,
});

const dominantSuggestion = (
  { fromTitle, toTitle, fromKey, toKey }: TransitionSongs,
  cold: boolean
): TransitionSuggestion => {
  const dominant = chordName(dominantSeventhOf(toKey));
  if (!cold && dominantIsIn(fromKey, toKey)) {
    const dominantTriad = dominant.replace(/7$/u, "");
    const endsHome = dominantTriad === keyName(fromKey);
    return {
      id: "dominant",
      title: "End on the chord that leads in",
      segments: [
        text(`End ${fromTitle} on `),
        chord(dominantTriad),
        text(
          endsHome
            ? ", make it "
            : ` (already a chord in ${keyName(fromKey)}), make it `
        ),
        chord(dominant),
        text(`, then start ${toTitle} in `),
        chord(keyName(toKey)),
        text("."),
      ],
    };
  }
  return {
    id: "dominant",
    title: cold ? "Stop, then set it up" : "Set up the new key",
    segments: [
      text(
        cold
          ? `Stop fully after ${fromTitle}, then play `
          : `After ${fromTitle}, play `
      ),
      chord(dominant),
      text(` into ${toTitle} in `),
      chord(keyName(toKey)),
      text("."),
    ],
  };
};

/** 1. A chord both keys share: the smoothest way across (a worship leader's first choice). */
const commonChordSuggestion = ({
  fromTitle,
  toTitle,
  fromKey,
  toKey,
}: TransitionSongs): TransitionSuggestion | null => {
  if (homeChordIsIn(fromKey, toKey)) {
    return {
      id: "common-chord",
      title: "End on the next song's home chord",
      segments: [
        text(`End ${fromTitle} on `),
        chord(keyName(toKey)),
        text(
          ` (it's already a chord in ${keyName(fromKey)}), then start ${toTitle} right there.`
        ),
      ],
    };
  }
  if (dominantIsIn(fromKey, toKey)) {
    return dominantSuggestion({ fromTitle, toTitle, fromKey, toKey }, false);
  }
  const shared = pivotChords(fromKey, toKey).find(
    (pivot) => !pivot.borrowed
  )?.chord;
  if (shared === undefined) {
    return null;
  }
  return {
    id: "common-chord",
    title: "End on a chord both keys share",
    segments: [
      text(`End ${fromTitle} on `),
      chord(chordName(shared)),
      text(` (it's the ${shared.numeral} of ${keyName(toKey)}), then `),
      chord(chordName(dominantSeventhOf(toKey))),
      text(` into ${toTitle}.`),
    ],
  };
};

/** 2. A chord of the old key sliding to its relative in the new key (C to Am shares two notes). */
const relativeChordSuggestion = ({
  fromTitle,
  toTitle,
  fromKey,
  toKey,
}: TransitionSongs): TransitionSuggestion | null => {
  const [pair] = relativePivots(fromKey, toKey);
  if (pair === undefined) {
    return null;
  }
  return {
    id: "relative-chord",
    title: "Slide to a relative chord",
    segments: [
      text(`End ${fromTitle} on `),
      chord(chordName(pair.from)),
      text(", move to its relative "),
      chord(chordName(pair.to)),
      ...(pair.to.numeral === "V"
        ? [
            text(", make it "),
            chord(chordName(dominantSeventhOf(toKey))),
            text(`, then start ${toTitle} in `),
            chord(keyName(toKey)),
            text("."),
          ]
        : [
            text(` (the ${pair.to.numeral} of ${keyName(toKey)}), then `),
            chord(chordName(dominantSeventhOf(toKey))),
            text(` into ${toTitle}.`),
          ]),
    ],
  };
};

const isHome = (candidate: { numeral: string }) =>
  candidate.numeral === "I" || candidate.numeral === "i";

/**
 * 3. A held note: end on a chord but keep one of its notes ringing, and let it become
 * part of the next song's first chord. When the home chords share nothing, the first
 * song can end on a nearby chord instead, or the next can open on a different one.
 */
const commonToneSuggestion = ({
  fromTitle,
  toTitle,
  fromKey,
  toKey,
}: TransitionSongs): TransitionSuggestion | null => {
  const [shared] = commonToneChords(fromKey, toKey);
  if (shared === undefined) {
    return null;
  }
  const ending: AdviceSegment[] = isHome(shared.from)
    ? [text(`End ${fromTitle} on `), chord(chordName(shared.from))]
    : [
        text(`End ${fromTitle} on `),
        chord(chordName(shared.from)),
        text(` (its ${shared.from.numeral}) instead of `),
        chord(keyName(fromKey)),
      ];
  const opening: AdviceSegment[] = isHome(shared.to)
    ? [
        text(`${toTitle}'s opening `),
        chord(chordName(shared.to)),
        text(" chord."),
      ]
    : [
        chord(chordName(shared.to)),
        text(`: open ${toTitle} on `),
        chord(chordName(shared.to)),
        text(` (its ${shared.to.numeral}), then `),
        chord(chordName(dominantSeventhOf(toKey))),
        text(" to land in "),
        chord(keyName(toKey)),
        text("."),
      ];
  return {
    id: "common-tone",
    title: "Hold a note across",
    segments: [
      ...ending,
      text(", but hold the "),
      chord(noteName(shared.fromTone)),
      text(
        noteName(shared.fromTone) === noteName(shared.tone)
          ? ` (its ${shared.fromRole}). It becomes the ${shared.toRole} of `
          : ` (its ${shared.fromRole}). As ${noteName(shared.tone)}, it becomes the ${shared.toRole} of `
      ),
      ...opening,
    ],
  };
};

/** A chord borrowed from the old key's parallel minor, when nothing is truly shared. */
const borrowedChordSuggestion = ({
  fromTitle,
  toTitle,
  fromKey,
  toKey,
}: TransitionSongs): TransitionSuggestion | null => {
  const borrowed = pivotChords(fromKey, toKey).find(
    (pivot) => pivot.borrowed
  )?.chord;
  if (borrowed === undefined) {
    return null;
  }
  return {
    id: "borrowed-chord",
    title: "Borrow a chord",
    segments: [
      text(`End ${fromTitle} on `),
      chord(chordName(borrowed)),
      text(
        ` (borrowed from ${keyName(parallelOf(fromKey))}; the ${borrowed.numeral} of ${keyName(toKey)}), then `
      ),
      chord(chordName(dominantSeventhOf(toKey))),
      text(` into ${toTitle}.`),
    ],
  };
};

const padSuggestion = ({
  toTitle,
  toKey,
}: TransitionSongs): TransitionSuggestion => ({
  id: "pad",
  title: "Reset under a prayer",
  segments: [
    text(
      `Put a short prayer or reading before ${toTitle}, with a pad moving to `
    ),
    chord(keyName(toKey)),
    text("."),
  ],
});

const swapSuggestion = ({
  fromTitle,
  toTitle,
}: TransitionSongs): TransitionSuggestion => ({
  id: "swap",
  title: "Swap them",
  segments: [
    text(
      `Sing ${toTitle} before ${fromTitle}, so the same change becomes a lift up.`
    ),
  ],
});

/**
 * Concrete ways to connect two songs, most useful first, for the case the rating found.
 * Following a trusted worship leader's order: common chords, then common relative
 * chords, then common tones that turn into one of those, then the case's own fallbacks.
 * Moving the next song to another key on its arrangement is offered separately, because
 * it needs that arrangement's keys.
 */
const noSuggestions = (): TransitionSuggestion[] => [];

/**
 * Ways out of each rough case once shared chords, relative chords, and held notes
 * (always tried first, in that order) run out.
 */
const FALLBACKS_BY_KIND = {
  same: noSuggestions,
  parallel: noSuggestions,
  relative: noSuggestions,
  close: noSuggestions,
  lift: noSuggestions,
  mediant: (songs) => [
    borrowedChordSuggestion(songs),
    dominantSuggestion(songs, false),
    padSuggestion(songs),
  ],
  "step-down": (songs) => [
    dominantSuggestion(songs, false),
    swapSuggestion(songs),
  ],
  "half-step-down": (songs) => [
    swapSuggestion(songs),
    padSuggestion(songs),
    dominantSuggestion(songs, true),
  ],
  tritone: (songs) => [padSuggestion(songs), dominantSuggestion(songs, true)],
  "distant-mode": (songs) => [
    borrowedChordSuggestion(songs),
    dominantSuggestion(songs, false),
    padSuggestion(songs),
  ],
} as const satisfies Record<
  KeyChangeKind,
  (songs: TransitionSongs) => (TransitionSuggestion | null)[]
>;

/** The most suggestions one warning shows. */
const MAX_SUGGESTIONS = 4;

/**
 * Concrete ways to connect two songs, most useful first, for the case the rating found.
 * Moving the next song to another key on its arrangement is offered separately, because
 * it needs that arrangement's keys.
 */
export const transitionSuggestions = (
  songs: TransitionSongs,
  kind: KeyChangeKind
): TransitionSuggestion[] => {
  const fallbacks = FALLBACKS_BY_KIND[kind](songs);
  if (fallbacks.length === 0) {
    return [];
  }
  const ordered = [
    commonChordSuggestion(songs),
    relativeChordSuggestion(songs),
    commonToneSuggestion(songs),
    ...fallbacks,
  ].filter((suggestion) => suggestion !== null);
  // A fallback can repeat a common chord (ending on the new key's V), so keep the first.
  return ordered
    .filter(
      (suggestion, index) =>
        ordered.findIndex((other) => other.id === suggestion.id) === index
    )
    .slice(0, MAX_SUGGESTIONS);
};

/** Semitones a key may move to smooth a change without leaving the leader's range. */
export const MAX_ALTERNATE_SEMITONES = 2;

/**
 * Other keys for the next song that come in smoothly and sit within a whole step of the
 * planned key, smallest move first, then the lower one (research, section 4).
 */
export const rankAlternateKeys = <T>(
  songs: Pick<TransitionSongs, "fromKey" | "toKey">,
  candidates: readonly { key: MusicalKey; value: T }[]
): T[] => {
  const ranked: { value: T; shift: number }[] = [];
  for (const { key, value } of candidates) {
    const up = semitonesUp(songs.toKey, key);
    const shift = up > OCTAVE / 2 ? up - OCTAVE : up;
    if (
      shift !== 0 &&
      Math.abs(shift) <= MAX_ALTERNATE_SEMITONES &&
      rateKeyChange(songs.fromKey, key).level === "smooth"
    ) {
      ranked.push({ value, shift });
    }
  }
  return ranked
    .toSorted(
      (a, b) => Math.abs(a.shift) - Math.abs(b.shift) || a.shift - b.shift
    )
    .map(({ value }) => value);
};
