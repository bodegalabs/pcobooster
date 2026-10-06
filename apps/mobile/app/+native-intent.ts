import { deliverDemoKey } from "../src/app-shell/link-inbox";
import { parseAppLink } from "../src/session/app-link";

/**
 * Every URL that opens the app passes here before expo-router routes it (Swift `onOpenURL`):
 * demo links start the demo instead of routing, sign-in callbacks are never routed (only the
 * web authentication session that started the sign-in may read one), and app paths route as
 * usual. Anything else is ignored.
 */
export const redirectSystemPath = ({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null => {
  const stay = initial ? "/" : null;
  if (path.startsWith("/")) {
    return path;
  }
  const link = parseAppLink(path);
  if (link === null || link.kind === "authCallback") {
    return stay;
  }
  if (link.kind === "demo") {
    deliverDemoKey(link.key);
    return stay;
  }
  return link.path;
};
