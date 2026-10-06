import { useRootNavigationState, useRouter } from "expo-router";
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
 * Opens `-PCOBGallery`, `-PCOBRoute`, or `-PCOBTab` once, after the root navigator is ready
 * (development builds only; Release launch options are empty).
 */
export const LaunchRoute = ({ isSignedIn }: { isSignedIn: boolean }) => {
  const router = useRouter();
  const navigationKey = useRootNavigationState()?.key;
  const hasOpened = useRef(false);
  useEffect(() => {
    if (hasOpened.current || navigationKey === undefined) {
      return;
    }
    hasOpened.current = true;
    const href = launchHref(isSignedIn);
    if (href !== null) {
      router.push(href);
    }
  }, [isSignedIn, navigationKey, router]);
  return null;
};
