const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Generational suffixes read as a last name only by accident ("… Montgomery III" is not "CI"). */
const SUFFIX = /^(?:jr|sr|ii|iii|iv|v)\.?$/iu;
/** Words that start with a letter; a leading emoji ("🦊 Fox") is decoration, not an initial. */
const STARTS_WITH_LETTER = /^\p{L}/u;

const leadingGraphemes = (word: string, count: number): string =>
  Array.from(graphemes.segment(word), ({ segment }) => segment)
    .slice(0, count)
    .join("");

/**
 * Two-letter avatar initials from the first and last name words, by grapheme so accents and
 * surrogate pairs stay whole. One word gives its first two letters; no letters gives "?".
 */
export const getInitials = (name: string): string => {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => STARTS_WITH_LETTER.test(word));
  const named =
    words.length > 2 ? words.filter((word) => !SUFFIX.test(word)) : words;
  const [first] = named;
  if (first === undefined) {
    return "?";
  }
  const last = named.length > 1 ? named.at(-1) : undefined;
  const initials =
    last === undefined
      ? leadingGraphemes(first, 2)
      : `${leadingGraphemes(first, 1)}${leadingGraphemes(last, 1)}`;
  return initials.toUpperCase();
};
