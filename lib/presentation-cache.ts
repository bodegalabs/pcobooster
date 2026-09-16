/** The server writes this attribute before any client code can read saved data. */
export function presentationCacheKey(key: string): string {
  const scope = typeof document === "undefined"
    ? "live"
    : document.documentElement.dataset.presentationScope ?? "live";
  return scope === "live" ? key : `${key}:${scope}`;
}
