/**
 * Builds a `Headers` instance from a base map plus optional `HeadersInit`, for use in `fetch`
 * init objects (avoids invalid object spread when `HeadersInit` is an array or `Headers`).
 */
export const mergeHeaders = (
  base: Record<string, string>,
  extra?: HeadersInit
): Headers => {
  const headers = new Headers(base);
  if (!extra) {
    return headers;
  }

  for (const [key, value] of new Headers(extra)) {
    headers.set(key, value);
  }
  return headers;
};
