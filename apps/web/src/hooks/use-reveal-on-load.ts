import { useState } from "react";

/**
 * Returns the `content-enter` class only when content replaces a skeleton this
 * component actually showed, so cached content appears instantly without a
 * redundant fade on every remount.
 */
export const useRevealOnLoad = (isLoading: boolean): string | undefined => {
  const [sawLoading, setSawLoading] = useState(isLoading);
  if (isLoading && !sawLoading) {
    setSawLoading(true);
  }
  return sawLoading && !isLoading ? "content-enter" : undefined;
};
