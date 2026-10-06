/**
 * Links the app answers (Swift `AppLink` and `DemoLink`). Demo links are
 * `pcobooster://demo/<key>` (or `pcobooster-dev://` in development builds) and
 * `https://pcobooster.com/demo/<key>`; demo keys are never compiled into the app.
 */

/** The app's custom schemes: release links, and development builds' own scheme. */
export const APP_SCHEMES = ["pcobooster", "pcobooster-dev"] as const;

const WEB_HOSTS = new Set(["pcobooster.com", "www.pcobooster.com"]);

/** The shortest key accepted (production keys are at least 24 characters). */
const MINIMUM_KEY_LENGTH = 8;
/** URL-safe ASCII, the alphabet the server's keys use. */
const DEMO_KEY = /^[A-Za-z0-9._~-]+$/u;
const WHITESPACE = /\s/u;
const DEMO_SEGMENT = /\/demo\//iu;
const PATH_END = /[/?#]/u;
const QUERY_OR_FRAGMENT = /[?#]/u;
const SCHEME_PREFIX = /^(?<scheme>[a-z][a-z0-9+.-]*):\/\//iu;

export type AppLink =
  | { readonly kind: "demo"; readonly key: string }
  /** The native sign-in callback; only an active web authentication session may use it. */
  | { readonly kind: "authCallback" }
  /** An app path for the router (`/services`, `/account`). */
  | { readonly kind: "path"; readonly path: string };

/** A demo key from a full link (`https://pcobooster.com/demo/<key>`, `pcobooster://demo/<key>`), a
 * scheme-less link (`pcobooster.com/demo/<key>`), or the bare key; null for anything else. */
export const demoKeyFromText = (text: string): string | null => {
  const trimmed = text.trim();
  if (trimmed === "" || WHITESPACE.test(trimmed)) {
    return null;
  }
  let candidate: string;
  const match = DEMO_SEGMENT.exec(trimmed);
  if (match === null) {
    if (trimmed.includes("/") || trimmed.includes(":")) {
      return null;
    }
    candidate = trimmed;
  } else {
    const rest = trimmed.slice(match.index + match[0].length);
    const end = rest.search(PATH_END);
    candidate = end === -1 ? rest : rest.slice(0, end);
  }
  let key: string;
  try {
    key = decodeURIComponent(candidate);
  } catch {
    return null;
  }
  return key.length >= MINIMUM_KEY_LENGTH && DEMO_KEY.test(key) ? key : null;
};

/**
 * What a URL opened from outside asks for, or null to ignore it. Custom scheme links read the host
 * as the first path segment (`pcobooster://demo/<key>` is `/demo/<key>`).
 */
export const parseAppLink = (url: string): AppLink | null => {
  const scheme = SCHEME_PREFIX.exec(url)?.groups?.scheme?.toLowerCase();
  if (scheme === undefined) {
    return null;
  }
  const rest = url.slice(scheme.length + "://".length);
  let path: string;
  if (APP_SCHEMES.some((candidate) => candidate === scheme)) {
    path = `/${rest}`;
  } else if (scheme === "https") {
    const slash = rest.search(PATH_END);
    const host = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase();
    if (!WEB_HOSTS.has(host)) {
      return null;
    }
    path = slash === -1 ? "/" : rest.slice(slash);
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
  } else {
    return null;
  }
  const pathname = path.split(QUERY_OR_FRAGMENT)[0] ?? "/";
  const segments = pathname.split("/").filter((segment) => segment !== "");
  const [first, second] = segments;
  if (first === "auth") {
    return { kind: "authCallback" };
  }
  if (first === "demo") {
    const key =
      segments.length === 2 && second !== undefined
        ? demoKeyFromText(second)
        : null;
    return key === null ? null : { kind: "demo", key };
  }
  return { kind: "path", path };
};
