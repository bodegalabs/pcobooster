export const ELLIPSIS = "…";

/** The longest trailing share of the width an ending may take. */
const MAX_TAIL_SHARE = 0.5;

export type MeasureText = (text: string) => number;

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

const toGraphemes = (text: string): string[] =>
  Array.from(graphemeSegmenter.segment(text), (part) => part.segment);

interface Tail {
  text: string;
  joiner: string;
}

/**
 * Endings worth keeping: each run of whole trailing words that fits in half
 * the width, or the last graphemes of a single long word.
 */
const tailOptions = (
  text: string,
  maxTailWidth: number,
  measure: MeasureText
): Tail[] => {
  const words = text.split(" ");
  const options: Tail[] = [];
  for (let index = words.length - 1; index > 0; index -= 1) {
    const candidate = words.slice(index).join(" ");
    if (measure(candidate) > maxTailWidth) {
      break;
    }
    options.push({ text: candidate, joiner: " " });
  }
  if (options.length > 0) {
    return options;
  }

  const graphemes = toGraphemes(text);
  let low = 0;
  let high = Math.floor(graphemes.length / 2);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(graphemes.slice(-middle).join("")) <= maxTailWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return [
    { text: low === 0 ? "" : graphemes.slice(-low).join(""), joiner: "" },
  ];
};

/** The longest start of `head` that fits beside `suffix`. */
const fitHead = (
  head: string[],
  suffix: string,
  maxWidth: number,
  measure: MeasureText
): string => {
  let low = 0;
  let high = head.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      measure(`${head.slice(0, middle).join("").trimEnd()}${suffix}`) <=
      maxWidth
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return head.slice(0, low).join("").trimEnd();
};

const countWholeWords = (kept: string, fullHead: string): number => {
  if (kept === "") {
    return 0;
  }
  const words = kept.split(" ").length;
  const endsOnBoundary =
    kept.length === fullHead.length || fullHead[kept.length] === " ";
  return endsOnBoundary ? words : words - 1;
};

/**
 * Shortens `text` to fit `maxWidth` by removing its middle, keeping the start
 * and a meaningful ending ("Camera 3 Rig… AM", "Rehearsal f… PM service").
 * Each possible ending is tried; the result showing the most whole words wins,
 * then the one showing the most characters, then the longer ending. Returns
 * the text unchanged when it fits.
 */
export const middleTruncate = (
  text: string,
  maxWidth: number,
  measure: MeasureText
): string => {
  if (maxWidth <= 0 || measure(text) <= maxWidth) {
    return text;
  }

  let best = { display: "", wholeWords: -1, visible: -1 };
  for (const tail of tailOptions(text, maxWidth * MAX_TAIL_SHARE, measure)) {
    const suffix = `${ELLIPSIS}${tail.joiner}${tail.text}`;
    const fullHead = text.slice(0, text.length - tail.text.length);
    const kept = fitHead(toGraphemes(fullHead), suffix, maxWidth, measure);
    const tailWords = tail.joiner === "" ? 0 : tail.text.split(" ").length;
    const wholeWords = countWholeWords(kept, fullHead) + tailWords;
    const visible = toGraphemes(`${kept}${tail.text}`).length;
    const isBetter =
      wholeWords > best.wholeWords ||
      (wholeWords === best.wholeWords && visible >= best.visible);
    if (isBetter) {
      best = {
        display: kept === "" ? suffix.trim() : `${kept}${suffix}`,
        wholeWords,
        visible,
      };
    }
  }
  return best.display;
};
