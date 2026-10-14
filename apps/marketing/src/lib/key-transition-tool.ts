import { parseMusicalKey } from "@pcobooster/planning-center-models/key-theory";
import type { MusicalKey } from "@pcobooster/planning-center-models/key-theory";
import {
  rankAlternateKeys,
  rateKeyChange,
  transitionSuggestions,
} from "@pcobooster/planning-center-models/key-transition-advice";
import type {
  KeyChangeRating,
  TransitionSuggestion,
} from "@pcobooster/planning-center-models/key-transition-advice";

/*
 * The public key transition page: the product's own key change rating and advice, for two
 * keys a visitor picks instead of two songs in a plan.
 */

/** The twelve tonics as bands read them in each mode (Bb and F#, Ebm and G#m). */
export const MAJOR_KEYS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;
export const MINOR_KEYS = [
  "Cm",
  "C#m",
  "Dm",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "Bbm",
  "Bm",
] as const;

export type KeyChoice =
  | (typeof MAJOR_KEYS)[number]
  | (typeof MINOR_KEYS)[number];

export const keyChoicesFor = (minor: boolean): readonly KeyChoice[] =>
  minor ? MINOR_KEYS : MAJOR_KEYS;

export const isMinorChoice = (choice: KeyChoice): boolean =>
  choice.endsWith("m");

/** The same tonic in the other mode, by position in the list: G and Gm, Db and C#m. */
export const switchMode = (choice: KeyChoice): KeyChoice => {
  const minor = isMinorChoice(choice);
  const index = keyChoicesFor(minor).indexOf(choice);
  return keyChoicesFor(!minor)[index] ?? choice;
};

const FIRST_SONG = "the first song";
const NEXT_SONG = "the next song";

export interface KeyTransitionAdvice {
  rating: KeyChangeRating;
  suggestions: TransitionSuggestion[];
  /** Nearby keys for the next song that come in smoothly, closest first. */
  alternates: KeyChoice[];
}

const musicalKeyOf = (choice: KeyChoice): MusicalKey => {
  const key = parseMusicalKey(choice);
  if (key === null) {
    throw new Error(`Unreadable key choice ${choice}`);
  }
  return key;
};

export const keyTransitionAdvice = (
  from: KeyChoice,
  to: KeyChoice
): KeyTransitionAdvice => {
  const fromKey = musicalKeyOf(from);
  const toKey = musicalKeyOf(to);
  const rating = rateKeyChange(fromKey, toKey);
  const songs = { fromTitle: FIRST_SONG, toTitle: NEXT_SONG, fromKey, toKey };
  const alternates =
    rating.level === "smooth"
      ? []
      : rankAlternateKeys(
          songs,
          keyChoicesFor(toKey.minor).map((choice) => ({
            key: musicalKeyOf(choice),
            value: choice,
          }))
        );
  return {
    rating,
    suggestions: transitionSuggestions(songs, rating.kind),
    alternates,
  };
};
