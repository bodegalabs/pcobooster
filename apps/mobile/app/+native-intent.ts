import { rememberNativeRoute } from "../src/auth/route-intent";
import { nativeIntentPath } from "../src/native-intent";

export const redirectSystemPath = ({
  path,
}: {
  path: string;
  initial: boolean;
}): string => {
  const normalized = nativeIntentPath(path);
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/";
  }
  const url = new URL(normalized, "https://pcobooster.com");
  rememberNativeRoute(url.pathname, Object.fromEntries(url.searchParams));
  for (const tab of ["services", "people", "songs", "search"]) {
    if (url.pathname === `/${tab}` || url.pathname.startsWith(`/${tab}/`)) {
      return `/(tabs)/(${tab})${normalized}`;
    }
  }
  return normalized;
};
