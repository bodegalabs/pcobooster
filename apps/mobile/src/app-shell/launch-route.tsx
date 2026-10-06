import { usePathname, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { useEffect, useRef } from "react";

import { launchOptions } from "../harness/current-launch-options";

/** The path a launch argument opens, if any: the gallery, a route, or a tab root. */
const launchHref = (isSignedIn: boolean): Href | null => {
  if (launchOptions.showsGallery) {
    return "/gallery";
  }
  if (!isSignedIn) {
    return null;
  }
  if (launchOptions.route !== null) {
    // Typed by hand on the command line; an unknown path shows expo-router's not-found screen.
    return launchOptions.route;
  }
  return launchOptions.tab === null ? null : `/${launchOptions.tab}`;
};

/**
 * Opens `-PCOBGallery`, `-PCOBRoute`, or `-PCOBTab` once (development builds only; Release
 * launch options are empty). It waits until the root index has redirected to its first screen,
 * so that redirect does not replace the launch route.
 */
export const LaunchRoute = ({ isSignedIn }: { isSignedIn: boolean }) => {
  const router = useRouter();
  const pathname = usePathname();
  const hasOpened = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!hasOpened.current && pathname !== "/") {
      const href = launchHref(isSignedIn);
      if (href === null) {
        hasOpened.current = true;
      } else {
        // Native tabs settle their initial Services screen after the root Redirect. An earlier
        // push is replaced by those initial params. This delay affects development launch args only.
        timer = setTimeout(() => {
          hasOpened.current = true;
          router.push(href);
        }, 500);
      }
    }
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [isSignedIn, pathname, router]);
  return null;
};
