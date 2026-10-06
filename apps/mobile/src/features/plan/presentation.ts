/** Show a modulation as two keys rather than literal "to" text. */
export const overviewSongKeys = (
  label: string | null
): { from: string; to: string } | null => {
  const parts = label?.split(" to ") ?? [];
  const [from, to] = parts;
  return parts.length === 2 && from !== undefined && to !== undefined
    ? { from, to }
    : null;
};

const WORDS = /\s+/u;
/** Use a trimmed name, otherwise the capitalized time type. */
export const overviewTimeTitle = (name: string, timeType: string): string => {
  const title = name.trim();
  return title === ""
    ? timeType
        .split(WORDS)
        .map(
          (word) =>
            `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
        )
        .join(" ")
    : title;
};
