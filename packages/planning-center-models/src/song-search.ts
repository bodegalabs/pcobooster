/** The song fields a search reads. */
export interface SearchableSong {
  readonly title: string;
  readonly author: string;
  readonly themes: string;
  readonly lastScheduledAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A match sung this recently ranks above an equal match that wasn't. */
const RECENT_DAYS = 180;

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();

/**
 * How well a song matches a search; 0 is no match. Every word has to appear in the title,
 * author, or themes, and title matches rank highest.
 */
export const scoreSongSearch = (
  entry: SearchableSong,
  query: string,
  now: Date = new Date()
): number => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const title = normalizeSearchText(entry.title);
  const author = normalizeSearchText(entry.author);
  const themes = normalizeSearchText(entry.themes);
  const haystack = `${title} ${author} ${themes}`.trim();
  const tokens = normalizedQuery.split(/\s+/u).filter(Boolean);
  // Every word has to match somewhere, so "way maker" doesn't bring up "Always".
  if (!tokens.every((token) => haystack.includes(token))) {
    return 0;
  }

  let score = 0;
  if (title === normalizedQuery) {
    score += 1000;
  }
  if (title.startsWith(normalizedQuery)) {
    score += 700;
  }
  if (title.includes(normalizedQuery)) {
    score += 500;
  }
  if (author.startsWith(normalizedQuery)) {
    score += 220;
  }
  if (author.includes(normalizedQuery)) {
    score += 140;
  }
  if (themes.includes(normalizedQuery)) {
    score += 120;
  }

  for (const token of tokens) {
    if (title.startsWith(token)) {
      score += 120;
    } else if (title.includes(token)) {
      score += 80;
    } else if (haystack.includes(token)) {
      score += 35;
    }
  }

  // Recency only breaks ties between songs that match; alone it isn't a match.
  if (score > 0 && entry.lastScheduledAt) {
    const ageDays = (now.getTime() - entry.lastScheduledAt.getTime()) / DAY_MS;
    if (ageDays < RECENT_DAYS) {
      score += 20;
    }
  }

  return score;
};
