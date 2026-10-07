import { DEMO_SESSION_COOKIE } from "@pcobooster/contracts/demo";

/** Commas that start another cookie (`, name=`), not the comma inside an `Expires` date. */
const COOKIE_SEPARATOR = /,\s*(?=[A-Za-z0-9!#$%&'*+.^_`|~-]+=)/u;
const MAX_AGE_ZERO = /^max-age\s*=\s*0$/iu;

/**
 * The demo token from `demo.start`'s `Set-Cookie: pcobooster-demo=<token>`; the native client
 * keeps it and sends `x-pcobooster-demo`. Several cookies may arrive joined with commas. An
 * expiring cookie (`Max-Age=0`) or an empty value is no token.
 */
export const demoTokenFromSetCookie = (
  header: string | null
): string | null => {
  if (header === null) {
    return null;
  }
  for (const cookie of header.split(COOKIE_SEPARATOR)) {
    const [pair = "", ...attributes] = cookie.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (separator === -1 || name !== DEMO_SESSION_COOKIE) {
      continue;
    }
    const expires = attributes.some((attribute) =>
      MAX_AGE_ZERO.test(attribute.trim())
    );
    return value === "" || expires ? null : value;
  }
  return null;
};
