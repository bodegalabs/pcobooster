/** First letters of the first two words, or the first two letters of a single word (web `getInitials`). */
export const initials = (name: string): string => {
  const [first, second] = name.trim().split(/\s+/u).filter(Boolean);
  if (first === undefined) {
    return "?";
  }
  if (second === undefined) {
    return first.slice(0, 2).toUpperCase();
  }
  return `${first.slice(0, 1)}${second.slice(0, 1)}`.toUpperCase();
};
